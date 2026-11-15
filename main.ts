// The token-radar-01 entry: one sealed snapshot in, one ranked board out.
//
// Run it from the repository root with Node 22:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
//
// The harness mounts the input at /input and the output at /output (or MAKEFUN_OUTPUT_DIR). The
// program reads the snapshot, scores every pre-token protocol with the model in lib/model.ts, and
// writes the board to /output/board.json, the dashboard's dataset to /output/data.js, then copies
// dashboard/ and screenshots/ to /output. Last it writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// No network, no wall clock, no randomness: the same snapshot always builds the same board, byte
// for byte, so the two grading runs agree.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, dataScript, parseSnapshot, SnapshotError } from './lib/model.ts';

const HOME = dirname(fileURLToPath(import.meta.url));
const OUTPUT_ENV = 'MAKEFUN_OUTPUT_DIR';
const INPUT_DEFAULT = '/input/snapshot.json';

/** The output directory: the harness's /output, or MAKEFUN_OUTPUT_DIR when it is set. */
function outputDir(): string {
  const dir = process.env[OUTPUT_ENV];
  if (dir !== undefined && dir !== '') return resolve(dir);
  return '/output';
}

/** The snapshot's path: --input <file|dir> first, else /input/snapshot.json. */
function inputPath(argv: string[]): string {
  const at = argv.indexOf('--input');
  if (at !== -1 && argv[at + 1] !== undefined) {
    const value = resolve(argv[at + 1]!);
    return statSync(value).isDirectory() ? join(value, 'snapshot.json') : value;
  }
  return INPUT_DEFAULT;
}

/** A directory, removed and recreated empty. */
function freshDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

/** The repository's own files, verbatim: the dashboard and the screenshots. */
function copyIn(dir: string, name: string): void {
  const source = join(HOME, name);
  if (!existsSync(source)) throw new Error(`this repository has no ${name}/ to ship`);
  cpSync(source, join(dir, name), { recursive: true });
}

/** The run: read the snapshot, build the board, write the output, and print the summary. */
function main(argv: string[]): number {
  let snapshot;
  try {
    snapshot = parseSnapshot(readFileSync(inputPath(argv), 'utf8'));
  } catch (e) {
    if (e instanceof SnapshotError) {
      console.error(`token-radar-01: ${e.message}`);
      return 1;
    }
    throw e;
  }

  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    console.error(`token-radar-01: the board is not valid: ${issue}`);
    return 1;
  }

  const out = outputDir();
  freshDir(out);
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board }, null, 2)}\n`, 'utf8');
  writeFileSync(join(out, 'data.js'), dataScript(radar), 'utf8');
  copyIn(out, 'dashboard');
  copyIn(out, 'screenshots');

  const dossier = buildDossier(out, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  });
  // buildDossier returns raw bytes (a Uint8Array): write them as-is, never through JSON.stringify,
  // which would spell the bytes out as an object of index keys.
  writeFileSync(join(out, 'dossier.json'), dossier);

  const watchlist = board.filter((r) => snapshot.watchlist.includes(r.slug)).length;
  console.log(
    `token-radar-01: board.json has ${board.length} rows (${watchlist} watchlist, ${radar.early_size} early), ` +
      `top implied value $${board[0]!.implied_value_usd}, dossier ${dossier.length} bytes`,
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
