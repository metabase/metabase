## Getting answers in Slack with MetaBot

You can already send data to Slack on  a set schedule via [Pulses](09-pulses.md) but what about when you need an answer right now? Say hello to MetaBot.

MetaBot helps add context to conversations you’re having in Slack by letting you insert results from Metabase.

### Connecting to Slack.
To use MetaBot with Slack you’ll first need to connect Metabase to your Slack with an API token.

See [Setting up Slack](http://www.metabase.com/docs/latest/administration-guide/07-setting-up-slack) for more information.


### What can MetaBot do?

MetaBot can show individual questions and also lists of questions that have already been asked in Metabase.

If you ever need help remembering what MetaBot can do, just type ```metabot help``` in Slack.

![MetaBot help](images/metabot/MetabotHelp.png)

### Showing questions

To see a question from Metabase in Slack type
'''metabot show "<question-name>"''' where question name is the title of one of saved questions. If you have several similarly named questions Metabot will ask you to differentiate between the two by typing the number next to the name.

![MetaBot similar](images/metabot/MetabotSimilarItems.png)

That number is the ID number of the question in Metabase and if you find yourself using the same question over and over again you can save a bit of time by typing “MetaBot show 19.”

![MetaBot show](images/metabot/MetabotShow.png)

## Listing questions
If you don’t have a sense of which questions you want to view in  Slack, you can type ```MetaBot list``` to get a list of recent questions from your Metabase.

![MetaBot show](images/metabot/MetabotList.png)


## To review

- [Connect to Slack](09-pulses.md) to start using MetaBot.
- Show data from Metabase in Slack using ```metabot show <question-id>```
- Search for questions by typing ```metabot show <search-term>```
- Get a list of questions by typing ```metabot list```
- ```metabot help``` lets you see everything MetaBot can do if you forget or need more information


---

## Next:

Sometimes you’ll need help understanding what data is available to you and what it means. Metabase provides a way for your administrators and data experts to build a [data model reference](12-data-model-reference.md) to help you make sense of your data.
