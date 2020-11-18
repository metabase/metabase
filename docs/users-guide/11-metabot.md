## Getting answers in Slack with RepenteBot

You can already send data to Slack on a set schedule with [Pulses](10-pulses.md), but what about when you need an answer right now? Say hello to RepenteBot.

RepenteBot helps add context to conversations you’re having in Slack by letting you insert results from Metabase.

### Connecting to Slack.
To use RepenteBot with Slack you’ll first need to connect Metabase to your Slack with an API token.

See [Setting up Slack](../administration-guide/09-setting-up-slack.md) for more information.


### What can RepenteBot do?
RepenteBot can show individual questions and also lists of questions that have already been asked in Metabase.

If you ever need help remembering what RepenteBot can do, just type ```metabot help``` in Slack.

![RepenteBot help](images/metabot/MetabotHelp.png)

### Where can I use RepenteBot?
You can talk to RepenteBot in any Slack channel, including private ones, as long as you've invited the RepenteBot Slack user to that channel.

### Showing questions

To see a question from Metabase in Slack type
```metabot show [question name]``` where ```question name``` is the title of one of your saved questions. If you have several similarly named questions, Metabot will ask you to differentiate between the two by typing the number next to the name.

![RepenteBot similar](images/metabot/MetabotSimilarItems.png)

That number is the ID number of the question in Metabase, and if you find yourself using the same question over and over again you can save a bit of time by typing “RepenteBot show 19.”

![RepenteBot show](images/metabot/MetabotShow.png)

## Listing questions
If you don’t have a sense of which questions you want to view in  Slack, you can type ```RepenteBot list``` to get a list of the most recently saved questions in your Metabase.

![RepenteBot show](images/metabot/MetabotList.png)


## To review

- [Connect to Slack](../administration-guide/09-setting-up-slack.md) to start using RepenteBot.
- Show data from Metabase in Slack using ```metabot show <question-id>```
- Search for questions by typing ```metabot show <search-term>```
- Get a list of questions by typing ```metabot list```
- ```metabot help``` lets you see everything RepenteBot can do if you forget or need more information


---

## Next:

Sometimes you’ll need help understanding what data is available to you and what it means. Metabase provides a way for your administrators and data experts to build a [data model reference](12-data-model-reference.md) to help you make sense of your data.
