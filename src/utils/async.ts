export type RetryOptions = {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 4,
    minDelayMs = 300,
    maxDelayMs = 3000,
    shouldRetry = () => true,
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries || !shouldRetry(err)) {
        throw err;
      }
      const backoff = Math.min(maxDelayMs, minDelayMs * Math.pow(2, attempt));
      const jitter = Math.random() * backoff * 0.2; // 0-20% jitter
      await sleep(backoff + jitter);
      attempt += 1;
    }
  }

  // Should be unreachable
  throw lastError as Error;
}

export function createConcurrencyLimiter(maxConcurrency: number) {
  if (maxConcurrency <= 0) throw new Error('maxConcurrency must be > 0');
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const run = queue.shift()!;
      run();
    }
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= maxConcurrency) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    activeCount++;
    try {
      const result = await fn();
      return result;
    } finally {
      next();
    }
  };

  return run;
}



