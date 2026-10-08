declare module "node:fs" {
  export function lstatSync(path: string): { isFile(): boolean; isDirectory(): boolean; size: number };
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): readonly { name: string; isFile(): boolean; isDirectory(): boolean }[];
}
declare module "node:path" {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function join(...paths: string[]): string;
  export function normalize(path: string): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}
declare const process: { argv: string[]; stdout: { write(text: string): void }; stderr: { write(text: string): void }; exitCode?: number; env?: Readonly<Record<string, string | undefined>> };
