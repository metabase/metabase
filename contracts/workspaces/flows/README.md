# Flows

Each `.flow` file is one caller sequence from the Linear doc "Workspaces API contract", written so a tool can check it against the specs. A step is `consumer -> provider: operationId {response fields the consumer reads}`, where the provider is the spec name (`parent`, `sidecar`).

Check them with [selvage](https://github.com/escherize/selvage), for example what the hardening PRs change for these callers:

```
selvage check -repo . -specs contracts/workspaces -flows contracts/workspaces/flows -base HEAD -base-view master -head-view master,hardening
```
