Metabot is your friendly robot who will answer the questions that you ask from Slack. Although it outsmarts human beings when you ask questions about your data, it's still not self aware when it comes to solving its own issues.

## Specific Problems

### Metabot does not answer on Slack or it's offline 

The Metabase server uses Websockets to connect to Slack to answer your question. You can keep Metabase completely isolated from the outside world and provide Metabot the possibility of connecting to your Slack workspace by using a Proxy server but it needs to support websockets.

Remember that Metabase supports connecting through a proxy by passing variables to the java command like:
`java -Dhttps.proxyHost=[your proxy's hostname] -Dhttps.proxyPort=[your proxy's port] -jar metabase.jar`

Please refer to Slack's help regarding connectivity in their [help center](https://slack.com/intl/en-dk/help/articles/360001603387-Manage-Slack-connection-issues)
