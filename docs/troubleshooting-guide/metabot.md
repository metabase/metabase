Metabot is your friendly robot who will answer the questions that you ask from Slack. Although it outsmarts human beings when you ask questions about your data, it's still not self aware when it comes to solving its own issues.

## Specific Problems

### Metabot does not answer on Slack or it's offline 

The Metabase server needs to have inbound and outbound connection for Slack to connect to the Metabot APIs so it can answer your question. You can keep Metabase completely isolated from the outside world and provide Metabot the possibility of connecting to your Slack workspace by using a Proxy server which needs to support SOCKS protocol and websockets.

Remember that Metabase supports connecting through a proxy by passing variables to the java command like:
`java -Dhttps.proxyHost=[your proxy's hostname] -Dhttps.proxyPort=[your proxy's port] -jar metabase.jar`
