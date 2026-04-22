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
   1. Can see UI showing which tx output table remappings exist
   1. Can see transaction run logs showing what the output tables were


## alt:

1. have a metabase instance locally with the github_raw data loaded on it. This is the parent. You'll need an api key to fetch metadata.
1. create a workspace on parent, add the github data
1. download config.yaml
1. create an empty github, add a single empty file to it and comit
1. start up local instance with config.yaml, add repo from above `file:///tmp/repo`
1. open up claude code in git repo directory. tell it url of local instance and api key to local instance
1. load the skill
1. create transforms, commit, load, run transforms
1. create dashboards, commit, load, go view
