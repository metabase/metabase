export function parseArgs(argv, { multiple = [], booleans = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (booleans.includes(name)) {
      out[name] = true;
      continue;
    }
    const value = argv[++i];
    if (multiple.includes(name)) {
      (out[name] ??= []).push(value);
    } else {
      out[name] = value;
    }
  }
  return out;
}
