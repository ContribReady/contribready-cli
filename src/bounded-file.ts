import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";

interface FileStats {
  isFile(): boolean;
  readonly size: number;
  readonly dev: number;
  readonly ino: number;
}

export interface BoundedFileOperations {
  readonly lstat: (path: string) => FileStats;
  readonly open: (path: string, flags: number) => number;
  readonly fstat: (descriptor: number) => FileStats;
  readonly read: (descriptor: number, buffer: Uint8Array, offset: number, length: number, position: number | null) => number;
  readonly close: (descriptor: number) => void;
}

const nativeOperations: BoundedFileOperations = {
  lstat: lstatSync,
  open: openSync,
  fstat: fstatSync,
  read: readSync,
  close: closeSync,
};

export function readBoundedFile(path: string, maxBytes: number, operations: BoundedFileOperations = nativeOperations): { readonly text: string; readonly bytes: number } | undefined {
  let descriptor: number | undefined;
  try {
    const pathStat = operations.lstat(path);
    if (!pathStat.isFile() || pathStat.size > maxBytes) return undefined;
    const noFollow = constants.O_NOFOLLOW ?? 0;
    descriptor = operations.open(path, constants.O_RDONLY | noFollow);
    const descriptorStat = operations.fstat(descriptor);
    // lstat + O_NOFOLLOW protects supported platforms; matching device/inode
    // also rejects a path replaced between lstat and open (notably on Windows,
    // where O_NOFOLLOW is unavailable). Reads then stay pinned to this handle.
    if (!descriptorStat.isFile() || descriptorStat.dev !== pathStat.dev || descriptorStat.ino !== pathStat.ino || descriptorStat.size > maxBytes) return undefined;
    const buffer = new Uint8Array(maxBytes + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const count = operations.read(descriptor, buffer, bytes, buffer.length - bytes, null);
      if (count === 0) break;
      bytes += count;
    }
    if (bytes > maxBytes) return undefined;
    return { text: new TextDecoder().decode(buffer.subarray(0, bytes)), bytes };
  } catch { return undefined; }
  finally { if (descriptor !== undefined) operations.close(descriptor); }
}
