import chalk from 'chalk';
import ora, { Ora } from 'ora';
import cliProgress from 'cli-progress';

class Logger {
  private spinner: Ora | null = null;
  private activeBars: Set<any> = new Set();

  info(message: string, ...args: any[]) {
    console.log(chalk.blue('9'), message, ...args);
  }

  success(message: string, ...args: any[]) {
    console.log(chalk.green(''), message, ...args);
  }

  warn(message: string, ...args: any[]) {
    console.log(chalk.yellow('�'), message, ...args);
  }

  error(message: string, ...args: any[]) {
    console.log(chalk.red(''), message, ...args);
  }

  startSpinner(message: string) {
    this.spinner = ora(message).start();
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
    }
  }

  createProgressBar(total: number, message?: string) {
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