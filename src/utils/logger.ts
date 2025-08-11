import chalk from 'chalk';
import ora, { Ora } from 'ora';
import cliProgress from 'cli-progress';

type LogLevelName = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LogLevelOrder: Record<LogLevelName, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

class Logger {
  private spinner: Ora | null = null;
  private activeBars: Set<any> = new Set();
  private level: LogLevelName;

  constructor() {
    const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevelName;
    this.level = (['silent', 'error', 'warn', 'info', 'debug'] as LogLevelName[]).includes(envLevel)
      ? envLevel
      : 'info';
  }

  setLevel(level: LogLevelName) {
    this.level = level;
  }

  private getInteractiveStream(): NodeJS.WriteStream | null {
    if (process.stderr && (process.stderr as any).isTTY) return process.stderr as NodeJS.WriteStream;
    if (process.stdout && (process.stdout as any).isTTY) return process.stdout as NodeJS.WriteStream;
    return null;
  }

  private shouldLog(required: LogLevelName): boolean {
    if (required === 'error') return true; // errors always print
    return LogLevelOrder[this.level] >= LogLevelOrder[required];
  }

  info(message: string, ...args: any[]) {
    if (!this.shouldLog('info')) return;
    console.info(chalk.blue('ℹ️'), message, ...args);
  }

  success(message: string, ...args: any[]) {
    if (!this.shouldLog('info')) return;
    console.log(chalk.green('✅'), message, ...args);
  }

  warn(message: string, ...args: any[]) {
    if (!this.shouldLog('warn')) return;
    console.warn(chalk.yellow('⚠️'), message, ...args);
  }

  error(message: string, ...args: any[]) {
    // Always show errors even when "silent"
    console.error(chalk.red('❌'), message, ...args);
  }

  debug(message: string, ...args: any[]) {
    if (!this.shouldLog('debug')) return;
    console.debug(chalk.gray('🐛'), message, ...args);
  }

  startSpinner(message: string) {
    if (!this.shouldLog('info')) return; // respect quiet modes
    const stream = this.getInteractiveStream();
    if (stream) {
      this.spinner = ora({ text: message, stream }).start();
    } else {
      this.spinner = null;
      this.info(message);
    }
  }

  updateSpinner(message: string) {
    if (!this.shouldLog('info')) return;
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  stopSpinner(success: boolean = true, message?: string) {
    if (!this.shouldLog('info')) return; // if quiet, spinner was never shown
    if (this.spinner) {
      if (success) {
        this.spinner.succeed(message);
      } else {
        this.spinner.fail(message);
      }
      this.spinner = null;
    } else if (message) {
      if (success) this.success(message); else this.error(message);
    }
  }

  createProgressBar(total: number, message?: string) {
    if (!this.shouldLog('info')) {
      // No-op progress bar to keep call sites simple
      return {
        increment: (_delta: number = 1, _text?: string) => {},
        update: (_position: number, _text?: string) => {},
        stop: () => {},
      } as const;
    }

    const stream = this.getInteractiveStream();
    if (!stream) {
      let current = 0;
      return {
        increment: (delta: number = 1, text?: string) => {
          current = Math.min(total, current + delta);
          if (message) this.info(`${message} ${current}/${total}${text ? ` | ${text}` : ''}`);
        },
        update: (position: number, text?: string) => {
          current = Math.min(total, Math.max(0, position));
          if (message) this.info(`${message} ${current}/${total}${text ? ` | ${text}` : ''}`);
        },
        stop: () => {},
      } as const;
    }

    const bar = new cliProgress.SingleBar(
      {
        format: `${message ? message + ' ' : ''}{bar} {value}/{total} | {percentage}% {text}`,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        stopOnComplete: true,
        stream,
      },
      cliProgress.Presets.shades_classic
    );

    let current = 0;
    bar.start(total, 0, { text: '' });
    this.activeBars.add(bar);

    return {
      increment: (delta: number = 1, text?: string) => {
        current = Math.min(total, current + delta);
        bar.update(current, { text: text ? `| ${text}` : '' });
      },
      update: (position: number, text?: string) => {
        current = Math.min(total, Math.max(0, position));
        bar.update(current, { text: text ? `| ${text}` : '' });
      },
      stop: () => {
        try {
          bar.stop();
        } finally {
          this.activeBars.delete(bar);
        }
      },
    } as const;
  }
}

export const logger = new Logger();