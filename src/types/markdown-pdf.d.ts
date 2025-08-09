declare module 'markdown-pdf' {
  interface MarkdownPdfOptions {
    paperFormat?: string;
    paperOrientation?: string;
    paperBorder?: string;
    renderDelay?: number;
    phantomPath?: string;
    runningsPath?: string;
    cssPath?: string;
    highlightCssPath?: string;
    preProcessMd?: () => void;
    preProcessHtml?: () => void;
  }

  interface MarkdownPdf {
    from(path: string): MarkdownPdf;
    from(paths: string[]): MarkdownPdf;
    to(path: string, callback: (err: any) => void): void;
    to(paths: string[], callback: (err: any) => void): void;
  }

  function markdownPdf(options?: MarkdownPdfOptions): MarkdownPdf;
  export = markdownPdf;
}