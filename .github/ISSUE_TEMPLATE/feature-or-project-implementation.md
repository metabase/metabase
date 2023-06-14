---
name: Feature or Project Implementation (Internal Use)
about: This issue is used to track a feature implementation for a solution to a user
  problem that may span days to weeks to implement. This is used by the core Metabase
  team to project plan and manage work.
title: [Epic] Title
labels: ".Epic"

---

<Insert feature / project description here>: Notes - This demonstrates a workflow and implementation plan around feature X that we can use in features that go out in a release. There should be a paragraph description of the problem we're trying to solve and a high level what the solution will be.

**Links**
- product doc: _link to product doc_
- eng doc: _link to technical design doc_
- feature branch: `branch-name` _this should be the feature branch where this work will be done in. PRs will be delivered against this branch_
- Issue links: _list of issues this should close when this is delivered_

**Implementation Plan**


***Milestone 1*** )_(note, each milestone should correspond to a point at which product/design can jump in to apply polish, evaluate changes, etc)_
- [x] step 1: #somePRnumber
- [ ] step 2
- [ ] step 3

***Milestone 2***
- [ ] etc

***Mileston N*** _(we can put stuff like translations, docs, testing, etc)_
- [ ] String translations
- [ ] Write rough pass documents for handoff to customer success


**How to Test This Feature Out**

_(include steps on how to test this project feature out, for someone unfamiliar with this work. please try to use the sample dataset when possible. this will serve as the basis for automated e2e tests, as well as the acceptance test to showcase the essence of this feature for bug bashes, etc)_
