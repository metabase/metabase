# Montreal Demo

## Steps

1. (enabled) Clone stats-remote-sync locally
1. Start "Parent" instance locally
1. Init workspace from parent MB
1. Export config.yml from parent MB
1. Substitute remote sync info into config.yml
1. (enabled) Start "Child" instance locally with config.yml
   1. config.yml is loaded to workspace config state
1. (enabled?) Run a transform on the child instance
   1. output goes to temp schema
1. (enabled?) Run a query on the child instance
   1. Input comes from temp schema
1. Tell claude to generate some models/transforms/dashboards
   1. Asset yml files are created
   2. Transform runs go to temp schema
1. Edited asset yml files committed and pushed
1. In parent instance, new assets are visible with results from "production"
