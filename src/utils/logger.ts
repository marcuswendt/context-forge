import chalk from 'chalk';
import ora, { Ora } from 'ora';

class Logger {
  private spinner: Ora | null = null;

  info(message: string, ...args: any[]) {
    console.log(chalk.blue('9'), message, ...args);
  }

  success(message: string, ...args: any[]) {
    console.log(chalk.green(''), message, ...args);
  }

  warn(message: string, ...args: any[]) {
    console.log(chalk.yellow(' '), message, ...args);
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
}

export const logger = new Logger();