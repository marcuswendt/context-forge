import chalk from 'chalk';
import ora, { Ora } from 'ora';
import cliProgress from 'cli-progress';

class Logger {
  private spinner: Ora | null = null;
  private activeBars: Set<any> = new Set();

  info(message: string, ...args: any[]) {
    console.info(chalk.blue('ℹ️'), message, ...args);
  }

  success(message: string, ...args: any[]) {
    console.log(chalk.green('✅'), message, ...args);
  }

  warn(message: string, ...args: any[]) {
    console.warn(chalk.yellow('⚠️'), message, ...args);
  }

  error(message: string, ...args: any[]) {
    console.error(chalk.red('❌'), message, ...args);
  }

  startSpinner(message: string) {
    if (process.stdout.isTTY) {
      this.spinner = ora(message).start();
    } else {
      this.spinner = null;
      this.info(message);
    }
  }

  updateSpinner(message: string) {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  stopSpinner(success: boolean = true, message?: string) {
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
    if (!process.stdout.isTTY) {
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
        format: `${message ? message + ' ' : ''}{bar} {value}/{total} | {percentage}% | {text}`,
        barCompleteChar: '#',
        barIncompleteChar: '-',
        hideCursor: true,
        stopOnComplete: true,
      },
      cliProgress.Presets.shades_classic
    );

    let current = 0;
    bar.start(total, 0, { text: '' });
    this.activeBars.add(bar);

    return {
      increment: (delta: number = 1, text?: string) => {
        current = Math.min(total, current + delta);
        bar.update(current, { text: text || '' });
      },
      update: (position: number, text?: string) => {
        current = Math.min(total, Math.max(0, position));
        bar.update(current, { text: text || '' });
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