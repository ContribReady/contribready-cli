declare module "node:fs" {
  export const constants: { readonly O_RDONLY: number; readonly O_NOFOLLOW?: number };
  export function closeSync(fd: number): void;
  export function fstatSync(fd: number): { isFile(): boolean; size: number; dev: number; ino: number };
  export function lstatSync(path: string): { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number; dev: number; ino: number };
  export function openSync(path: string, flags: number): number;
  export function opendirSync(path: string): { readSync(): { name: string; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean } | null; closeSync(): void };
  export function readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null): number;
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
