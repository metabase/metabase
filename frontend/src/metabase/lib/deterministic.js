function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// assigns values to keys using a best effort deterministic algorithm
//  keys: keys that need to be assigned values
//  values: all possible values to assign
//  existing: optional existing assignments
//  getPreferred: to get preferred assignments
export function deterministicAssign(
  keys,
  primaryTier,
  existing = {},
  getPreferred,
  secondaryTiers,
) {
  let unassigned = new Set(keys.slice().sort()); // sort the keys for extra determinism

  let all;
  let used;
  let values;

  const tiers = [primaryTier].concat(secondaryTiers || []);
  let current = -1;
  const nextTier = () => {
    current = (current + 1) % tiers.length;
    values = tiers[current];
    all = new Set(values);
    used = new Set();
  };
  nextTier();

  const assignments = {};

  const assign = (key, value) => {
    assignments[key] = value;
    unassigned.delete(key);
    // if assignment is one of the values mark it as used
    if (all.has(value)) {
      used.add(value);
    }
  };

  // add all exisisting assignments
  for (const [key, value] of Object.entries(existing)) {
    assign(key, value);
  }

  // attempt to get a "preferred" assignment, if desired
  if (getPreferred) {
    for (const key of unassigned) {
      const value = getPreferred(key, values);
      if (value !== undefined && !used.has(value)) {
        assign(key, value);
      }
    }
  }

  // assign as many values as possible. if there are still any remaining, shift by one and try again
  let iterations = 0;
  while (unassigned.size > 0) {
    if (all.size - used.size <= 0) {
      // if all have been used reset available options
      nextTier();
    }
    for (const key of unassigned) {
      const hash = Math.abs(hashCode(key)) + iterations;
      const value = values[hash % values.length];
      if (!used.has(value)) {
        assign(key, value);
      }
    }
    iterations++;
  }

  return assignments;
}
