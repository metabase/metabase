### Status

PENDING CI / PENDING REVIEW / READY _(choose one and update accordingly)_

### What does this PR accomplish?

- Reproduces #XXXXX

### How to test this manually?

- `yarn test-cypress-open`
- `relative/path/to/the/file` _(optionally, include the line number on which the test starts)_
> _(For still unfixed bug)_
- Replace `it.skip()` with `it.only()` to test this in isolation
- The test should fail until the related issue is fixed
> _(For a fixed bug)_
- The test should pass

### Additional notes:

> _(For still unfixed bug)_
- Once the issue is fixed, please remove the `.skip` part (unskip the test completely)
- Make sure the test is passing and
- Merge it together with the fix
> _(For a fixed bug)_
- Please merge this repro unskipped
- The bug was fixed in #YYYYY

### Questions:

- this is optional
