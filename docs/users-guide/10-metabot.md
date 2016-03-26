# Getting answers in Slack with Metabot

You can already send data to Slack on  a set schedule via [Pulses](http://www.metabase.com/docs/latest/users-guide/07-pulses) but what about when you need an answer right now?. Say hello to Metabot.

Metabot helps add context to conversations you’re having in Slack by letting you see results from Metabase as part of the conversation.

## Connecting to Slack.
To use Metabot with slack you’ll first need to connect Metabase to your Slack with an API token.

See [Setting up Slack](http://www.metabase.com/docs/v0.15.1/administration-guide/07-setting-up-slack) for more information.


## What can Metabot do?

Metabot can show individual questions and also lists of questions that have already been asked in Metabase.

If you ever need help remembering what Metabot can do, just type “metabot help” in Slack.

<help screenshot>

## Showing questions

To see a question from Metabase in Slack type
“metabot show” and then specify the name of a saved question. If you have several similarly named questions Metabot will ask you to differentiate between the two by typing the number next to the name.

<similar items screenshot>

That number is the ID number of the question in Metabase and if you find yourself using the same question over and over again you can save a bit of time by typing “metabot show 19”

## Listing questions
…

## To review

- [Connect to Slack](http://www.metabase.com/docs/latest/users-guide/07-pulses) to start using Metabot.
- Show data from Metabase in Slack using “metabot show <question-id>”
- Get a list of questions by typing “metabot list”
- Search for questions by typing “metabot show <search-term>”
- ```metabot help``` lets you see everything metabot can do if you forget or need more information
