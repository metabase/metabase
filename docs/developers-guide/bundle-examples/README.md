# Example: Lazy Loading Heavy Components

This directory contains example implementations of bundle size optimization techniques.

## Examples Included

1. **Lazy Loading Chart Components** - Shows how to lazy load visualization libraries
2. **Dynamic CSS Imports** - Demonstrates loading CSS with components
3. **Conditional Library Loading** - Shows loading libraries only when needed

## How to Use These Examples

These are reference implementations. To apply them to the actual codebase:

1. Review the pattern in the example
2. Find similar components in the codebase
3. Apply the same pattern
4. Test thoroughly
5. Measure bundle size impact with `bun run analyze-bundle`

## Before Implementing

1. Run baseline bundle analysis:
   ```bash
   bun run analyze-bundle:json
   mv stats.json stats-before.json
   ```

2. Make your changes

3. Run analysis again:
   ```bash
   bun run analyze-bundle:json
   mv stats.json stats-after.json
   ```

4. Compare the results to verify improvement

## Success Criteria

- Bundle size reduced
- No functionality lost
- Tests still pass
- Performance improved or maintained
