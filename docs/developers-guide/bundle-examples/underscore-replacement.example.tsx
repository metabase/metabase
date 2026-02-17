/**
 * Example: Replacing Underscore.js with Modern JavaScript
 * 
 * This example shows common Underscore patterns and their
 * modern JavaScript or lodash-es equivalents.
 * 
 * Why replace Underscore?
 * - Underscore is not tree-shakeable (~40KB always in bundle)
 * - Modern JavaScript has many built-in equivalents
 * - lodash-es is tree-shakeable (import only what you use)
 * 
 * NOTE: This file contains example patterns only. The "_old" examples
 * show how NOT to do things (using underscore), while the "_new" examples
 * show the recommended approach. This file is not meant to be executed.
 */

// ✅ GOOD: Specific lodash-es imports (tree-shakeable)
import debounce from "lodash-es/debounce";
import groupBy from "lodash-es/groupBy";
import pick from "lodash-es/pick";
import omit from "lodash-es/omit";
import isEqual from "lodash-es/isEqual";
import throttle from "lodash-es/throttle";
import shuffle from "lodash-es/shuffle";
import cloneDeep from "lodash-es/cloneDeep";

// This is just for demonstration purposes - DO NOT use underscore
declare const _: any;

/**
 * COMMON REPLACEMENTS
 */

// ============================================================================
// Array Methods
// ============================================================================

const items = [1, 2, 3, 4, 5];

// _.map() → Array.map()
const doubled_old = _.map(items, x => x * 2); // DON'T use this
const doubled_new = items.map(x => x * 2);

// _.filter() → Array.filter()
const evens_old = _.filter(items, x => x % 2 === 0);
const evens_new = items.filter(x => x % 2 === 0);

// _.find() → Array.find()
const found_old = _.find(items, x => x > 3);
const found_new = items.find(x => x > 3);

// _.some() → Array.some()
const hasEven_old = _.some(items, x => x % 2 === 0);
const hasEven_new = items.some(x => x % 2 === 0);

// _.every() → Array.every()
const allPositive_old = _.every(items, x => x > 0);
const allPositive_new = items.every(x => x > 0);

// _.reduce() → Array.reduce()
const sum_old = _.reduce(items, (sum, x) => sum + x, 0);
const sum_new = items.reduce((sum, x) => sum + x, 0);

// _.includes() → Array.includes()
const hasThree_old = _.includes(items, 3);
const hasThree_new = items.includes(3);

// _.first() → Array[0] or Array.at(0)
const first_old = _.first(items);
const first_new = items[0];
const first_newest = items.at(0); // Can use negative indices

// _.last() → Array.at(-1)
const last_old = _.last(items);
const last_new = items[items.length - 1];
const last_newest = items.at(-1);

// _.compact() → Array.filter(Boolean)
const withNulls = [1, null, 2, undefined, 3, false, 4];
const compacted_old = _.compact(withNulls);
const compacted_new = withNulls.filter(Boolean);

// _.uniq() → [...new Set()]
const duplicates = [1, 2, 2, 3, 3, 4];
const unique_old = _.uniq(duplicates);
const unique_new = [...new Set(duplicates)];

// _.flatten() → Array.flat()
const nested = [[1, 2], [3, 4], [5]];
const flat_old = _.flatten(nested);
const flat_new = nested.flat();

// _.sortBy() → Array.sort()
const users = [{ name: "John", age: 30 }, { name: "Jane", age: 25 }];
const sorted_old = _.sortBy(users, "age");
const sorted_new = [...users].sort((a, b) => a.age - b.age);

// ============================================================================
// Object Methods
// ============================================================================

const obj = { a: 1, b: 2, c: 3 };

// _.keys() → Object.keys()
const keys_old = _.keys(obj);
const keys_new = Object.keys(obj);

// _.values() → Object.values()
const values_old = _.values(obj);
const values_new = Object.values(obj);

// _.pairs() → Object.entries()
const pairs_old = _.pairs(obj);
const pairs_new = Object.entries(obj);

// _.extend() → Object.assign() or spread
const extended_old = _.extend({}, obj, { d: 4 });
const extended_new = Object.assign({}, obj, { d: 4 });
const extended_newest = { ...obj, d: 4 };

// _.pick() → Object destructuring or lodash-es for complex cases
const picked_old = _.pick(obj, ["a", "b"]); // DON'T use this
const picked_new = (({ a, b }) => ({ a, b }))(obj);
// Or use lodash-es (already imported at top) for complex cases:
const picked_lodash = pick(obj, ["a", "b"]);

// _.omit() → Object destructuring or lodash-es
const omitted_old = _.omit(obj, ["c"]); // DON'T use this
const { c, ...omitted_new } = obj;
// Or use lodash-es (already imported at top):
const omitted_lodash = omit(obj, ["c"]);

// _.isEmpty() → manual check or lodash-es
const isEmpty_old = _.isEmpty(obj);
const isEmpty_new = Object.keys(obj).length === 0;

// _.isEqual() → lodash-es (no native equivalent, already imported at top)
const equal = isEqual(obj, { a: 1, b: 2, c: 3 });

// ============================================================================
// Utility Methods
// ============================================================================

// _.debounce() → lodash-es (no native equivalent)
// Already imported at top
const debouncedFn = debounce(() => console.log("called"), 300);

// _.throttle() → lodash-es (no native equivalent)
// Already imported at top
const throttledFn = throttle(() => console.log("called"), 300);

// _.groupBy() → lodash-es or Object.groupBy (Stage 3)
// Already imported at top
const grouped = groupBy(users, "age");

// _.range() → Array.from()
const range_old = _.range(5); // [0, 1, 2, 3, 4]
const range_new = Array.from({ length: 5 }, (_, i) => i);
const range_newer = [...Array(5).keys()];

// _.times() → Array.from()
const times_old = _.times(3, () => Math.random());
const times_new = Array.from({ length: 3 }, () => Math.random());

// _.sample() → Manual
const sample_old = _.sample(items);
const sample_new = items[Math.floor(Math.random() * items.length)];

// _.shuffle() → lodash-es (no efficient native equivalent, already imported at top)
const shuffled = shuffle(items);

// _.clone() → Spread or structuredClone
const clone_old = _.clone(obj);
const clone_new = { ...obj }; // Shallow
const clone_deep = structuredClone(obj); // Deep (modern browsers)

// _.cloneDeep() → structuredClone or lodash-es (already imported at top)
const deepClone = cloneDeep(obj);

// ============================================================================
// Function Methods
// ============================================================================

// _.noop → () => {}
const noop_old = _.noop;
const noop_new = () => {};

// _.identity → x => x
const identity_old = _.identity;
const identity_new = (x: any) => x;

// _.constant → () => value
const constant_old = _.constant(42);
const constant_new = () => 42;

/**
 * MIGRATION STRATEGY
 */

/**
 * Step 1: Identify usage patterns
 * 
 * Run this command to find all underscore usage:
 * grep -r "import.*underscore" frontend/src --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx"
 */

/**
 * Step 2: Replace by priority
 * 
 * High Priority (use native JS):
 * - _.map, _.filter, _.find, _.some, _.every, _.reduce
 * - _.keys, _.values, _.entries
 * - _.includes, _.first, _.last
 * 
 * Medium Priority (use lodash-es):
 * - _.debounce, _.throttle
 * - _.groupBy, _.keyBy
 * - _.pick, _.omit
 * - _.cloneDeep, _.isEqual
 * 
 * Low Priority (consider alternatives):
 * - _.template → String literals or template libraries
 * - _.mixin → Composition
 */

/**
 * Step 3: Add ESLint rule to prevent new underscore imports
 * 
 * Add to .eslintrc:
 * {
 *   "rules": {
 *     "no-restricted-imports": ["error", {
 *       "patterns": [{
 *         "group": ["underscore"],
 *         "message": "Use lodash-es or native JavaScript instead. See docs/bundle-examples/underscore-replacement.example.tsx"
 *       }]
 *     }]
 *   }
 * }
 */

/**
 * COMPLETE EXAMPLE: Before and After
 */

// ❌ BEFORE: Using underscore
/*
import _ from "underscore";

function processUsers(users) {
  const active = _.filter(users, u => u.active);
  const grouped = _.groupBy(active, "department");
  const sorted = _.sortBy(active, "name");
  const names = _.map(sorted, "name");
  const unique = _.uniq(names);
  return unique;
}
*/

// ✅ AFTER: Using native JS and lodash-es (already imported at top)
function processUsers(users) {
  const active = users.filter(u => u.active);
  const grouped = groupBy(active, "department");
  const sorted = [...active].sort((a, b) => a.name.localeCompare(b.name));
  const names = sorted.map(u => u.name);
  const unique = [...new Set(names)];
  return unique;
}

/**
 * Expected savings: ~30-40KB (gzipped) after removing underscore
 */
