# Flows

Each `.flow` file is one caller sequence, written so a tool can check it against the specs in `contracts/workspaces`. The comment at the top of each file says what the sequence does. The sequences come from the Linear doc "Workspaces API contract" (https://linear.app/metabase/document/workspaces-api-contract-018c0d7bc9ca). Reading that doc needs access to Metabase's Linear; the flow files do not depend on it.

A step is `consumer -> provider: operationId {response fields the consumer reads} <- {request fields the consumer sends}`. The consumer names the caller: `mbcode` is MB Code (Metabase Code, the desktop app). The provider is the spec name (`parent`, `sidecar`). Both lists are optional. selvage checks that every read field is in the 2xx response and every sent field is in the JSON request body.

A view is a list of `x-status` values (`master`, `hardening`, `proposed`). A view keeps the untagged elements of a spec and the elements whose `x-status` is in the list. So the view `master` is the contract on the master branch, and the view `master,hardening` adds what an open PR changes. No PR is open now, so the two views are the same. A flow that uses a `proposed` operation passes only in a view that includes `proposed`.

Check the flows with [selvage](https://github.com/escherize/selvage). This example shows what an open PR changes for these callers:

```
selvage check -repo . -specs contracts/workspaces -flows contracts/workspaces/flows -base HEAD -base-view master -head-view master,hardening
```
