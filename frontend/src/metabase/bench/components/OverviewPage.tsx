import { Box, Text } from "metabase/ui";

const jokes = [
  {
    "setup": "Why did the data engineer break up with their database?",
    "punchline": "There were too many relationship issues"
  },
  {
    "setup": "What's a data engineer's favorite type of music?",
    "punchline": "Heavy metal... because they love their data pipelines"
  },
  {
    "setup": "Why do data engineers prefer dark mode?",
    "punchline": "Because the light attracts bugs in their ETL jobs"
  },
  {
    "setup": "How does a data engineer propose?",
    "punchline": "With a ring buffer"
  },
  {
    "setup": "Why did the data engineer go broke?",
    "punchline": "They kept losing their cache"
  },
  {
    "setup": "What do you call a data engineer who doesn't use version control?",
    "punchline": "Unemployed"
  },
  {
    "setup": "Why don't data engineers ever get lost?",
    "punchline": "They always follow the data pipeline"
  },
  {
    "setup": "What's a data engineer's favorite exercise?",
    "punchline": "Data squats... they're always cleaning"
  },
  {
    "setup": "Why did the data engineer quit their job?",
    "punchline": "They couldn't handle the throughput pressure"
  },
  {
    "setup": "How many data engineers does it take to change a light bulb?",
    "punchline": "None, that's a hardware problem"
  },
  {
    "setup": "Why do data engineers make terrible comedians?",
    "punchline": "Their jokes have too much latency"
  },
  {
    "setup": "What's a data engineer's favorite drink?",
    "punchline": "Java... but they'll settle for Python"
  },
  {
    "setup": "Why did the data engineer stay calm during the outage?",
    "punchline": "They had a backup plan"
  },
  {
    "setup": "What do you call a data engineer's autobiography?",
    "punchline": "A log file"
  },
  {
    "setup": "Why don't data engineers trust stairs?",
    "punchline": "They prefer step functions"
  },
  {
    "setup": "What's a data engineer's favorite movie?",
    "punchline": "The Matrix... obviously"
  },
  {
    "setup": "Why did the data engineer bring a ladder to work?",
    "punchline": "To reach the cloud"
  },
  {
    "setup": "How do data engineers stay in shape?",
    "punchline": "By doing data crunches"
  },
  {
    "setup": "Why was the data engineer always tired?",
    "punchline": "They worked the night batch"
  },
  {
    "setup": "What's a data engineer's least favorite season?",
    "punchline": "Fall... because of all the cascading failures"
  },
  {
    "setup": "Why did the data engineer become a gardener?",
    "punchline": "They were great at data seeding"
  },
  {
    "setup": "What do you call a lazy data engineer?",
    "punchline": "Someone who automates their automation"
  },
  {
    "setup": "Why don't data engineers like parties?",
    "punchline": "Too much unstructured data"
  },
  {
    "setup": "What's a data engineer's favorite game?",
    "punchline": "Minesweeper... they love finding hidden issues"
  },
  {
    "setup": "Why did the data engineer cross the road?",
    "punchline": "To get to the other pipeline"
  },
  {
    "setup": "What do you call a data engineer's pet?",
    "punchline": "A data retriever"
  },
  {
    "setup": "Why are data engineers bad at poker?",
    "punchline": "They always show their schemas"
  },
  {
    "setup": "What's a data engineer's favorite dessert?",
    "punchline": "Cookies... but only the session kind"
  },
  {
    "setup": "Why did the data engineer get glasses?",
    "punchline": "To improve their data visibility"
  },
  {
    "setup": "What do you call a data engineer who works out?",
    "punchline": "Buff-er overflow"
  },
  {
    "setup": "Why don't data engineers like surprises?",
    "punchline": "They prefer scheduled jobs"
  },
  {
    "setup": "What's a data engineer's favorite dance?",
    "punchline": "The shuffle"
  },
  {
    "setup": "Why did the data engineer become a chef?",
    "punchline": "They were already great at batch processing"
  },
  {
    "setup": "What do you call a data engineer's vacation?",
    "punchline": "Downtime"
  },
  {
    "setup": "Why are data engineers good at relationships?",
    "punchline": "They understand the importance of good connections"
  },
  {
    "setup": "What's a data engineer's favorite sport?",
    "punchline": "Data streaming"
  },
  {
    "setup": "Why did the data engineer go to therapy?",
    "punchline": "To work through their transformation issues"
  },
  {
    "setup": "What do you call a data engineer's diary?",
    "punchline": "A changelog"
  },
  {
    "setup": "Why don't data engineers like magic?",
    "punchline": "They prefer reproducible results"
  },
  {
    "setup": "What's a data engineer's favorite holiday?",
    "punchline": "Thanksgiving... they're grateful for idempotency"
  },
  {
    "setup": "Why did the data engineer become a plumber?",
    "punchline": "They were already fixing leaky pipelines"
  },
  {
    "setup": "What do you call a data engineer's nightmare?",
    "punchline": "A data swamp"
  },
  {
    "setup": "Why are data engineers bad at keeping secrets?",
    "punchline": "Everything ends up in the logs"
  },
  {
    "setup": "What's a data engineer's favorite board game?",
    "punchline": "Connect Four... billion rows"
  },
  {
    "setup": "Why did the data engineer join a band?",
    "punchline": "They wanted to work with better orchestration"
  },
  {
    "setup": "What do you call a data engineer's love letter?",
    "punchline": "A data stream"
  },
  {
    "setup": "Why don't data engineers like small talk?",
    "punchline": "They prefer big data"
  },
  {
    "setup": "What's a data engineer's favorite car?",
    "punchline": "A Tesla... because of the streaming data"
  },
  {
    "setup": "Why did the data engineer become a detective?",
    "punchline": "They were already good at data mining"
  },
  {
    "setup": "What do you call a data engineer's midlife crisis?",
    "punchline": "A schema migration"
  },
  {
    "setup": "Why are data engineers good at fishing?",
    "punchline": "They know how to handle data lakes"
  },
  {
    "setup": "What's a data engineer's favorite weather?",
    "punchline": "Cloudy with a chance of data"
  },
  {
    "setup": "Why did the data engineer become a librarian?",
    "punchline": "They loved organizing data warehouses"
  },
  {
    "setup": "What do you call a data engineer's bucket list?",
    "punchline": "An S3 bucket list"
  },
  {
    "setup": "Why don't data engineers like drama?",
    "punchline": "They prefer clean data"
  },
  {
    "setup": "What's a data engineer's favorite snack?",
    "punchline": "Byte-sized anything"
  },
  {
    "setup": "Why did the data engineer become a teacher?",
    "punchline": "They wanted to educate about data quality"
  },
  {
    "setup": "What do you call a data engineer's wedding?",
    "punchline": "A merge operation"
  },
  {
    "setup": "Why are data engineers bad at improvisation?",
    "punchline": "They need their schemas defined first"
  },
  {
    "setup": "What's a data engineer's favorite animal?",
    "punchline": "The Python"
  },
  {
    "setup": "Why did the data engineer go to the gym?",
    "punchline": "To work on their core... data model"
  },
  {
    "setup": "What do you call a data engineer's retirement?",
    "punchline": "Deprecated"
  },
  {
    "setup": "Why don't data engineers like cliffhangers?",
    "punchline": "They need closure on their transactions"
  },
  {
    "setup": "What's a data engineer's favorite TV show?",
    "punchline": "Breaking Batch"
  },
  {
    "setup": "Why did the data engineer become a bartender?",
    "punchline": "They were good at handling queues"
  },
  {
    "setup": "What do you call a data engineer's midday nap?",
    "punchline": "A sleep mode"
  },
  {
    "setup": "Why are data engineers good at meditation?",
    "punchline": "They practice data zen"
  },
  {
    "setup": "What's a data engineer's favorite pizza topping?",
    "punchline": "Sausage... links"
  },
  {
    "setup": "Why did the data engineer become a pilot?",
    "punchline": "They wanted to work with Airflow"
  },
  {
    "setup": "What do you call a data engineer's morning routine?",
    "punchline": "A bootstrap process"
  },
  {
    "setup": "Why don't data engineers like gossip?",
    "punchline": "They prefer verified data sources"
  },
  {
    "setup": "What's a data engineer's favorite superhero?",
    "punchline": "The Flash... for fast data processing"
  },
  {
    "setup": "Why did the data engineer become a musician?",
    "punchline": "They wanted to compose better queries"
  },
  {
    "setup": "What do you call a data engineer's shopping list?",
    "punchline": "A queue"
  },
  {
    "setup": "Why are data engineers bad at lying?",
    "punchline": "The audit logs always tell the truth"
  },
  {
    "setup": "What's a data engineer's favorite ice cream?",
    "punchline": "Vanilla... they love plain text"
  },
  {
    "setup": "Why did the data engineer become a doctor?",
    "punchline": "They were already diagnosing pipeline issues"
  },
  {
    "setup": "What do you call a data engineer's family tree?",
    "punchline": "A hierarchical data structure"
  },
  {
    "setup": "Why don't data engineers like chaos?",
    "punchline": "They prefer ordered data"
  },
  {
    "setup": "What's a data engineer's favorite book?",
    "punchline": "The Art of War... against data quality issues"
  },
  {
    "setup": "Why did the data engineer become a photographer?",
    "punchline": "They loved taking snapshots"
  },
  {
    "setup": "What do you call a data engineer's to-do list?",
    "punchline": "A backlog"
  },
  {
    "setup": "Why are data engineers good at puzzles?",
    "punchline": "They're used to joining tables"
  },
  {
    "setup": "What's a data engineer's favorite flower?",
    "punchline": "Tulips... two-lips for dual pipelines"
  },
  {
    "setup": "Why did the data engineer become a lawyer?",
    "punchline": "They were good at handling cases... statements"
  },
  {
    "setup": "What do you call a data engineer's road trip?",
    "punchline": "A data journey"
  },
  {
    "setup": "Why don't data engineers like mysteries?",
    "punchline": "They need their data documented"
  },
  {
    "setup": "What's a data engineer's favorite constellation?",
    "punchline": "The Big Dipper... for data lakes"
  },
  {
    "setup": "Why did the data engineer become an architect?",
    "punchline": "They were already designing data warehouses"
  },
  {
    "setup": "What do you call a data engineer's bedtime story?",
    "punchline": "A data tale"
  },
  {
    "setup": "Why are data engineers good at cooking?",
    "punchline": "They follow the recipe... or the DAG"
  },
  {
    "setup": "What's a data engineer's favorite card game?",
    "punchline": "Solitaire... they work alone a lot"
  },
  {
    "setup": "Why did the data engineer become a meteorologist?",
    "punchline": "They were already predicting data storms"
  },
  {
    "setup": "What do you call a data engineer's New Year's resolution?",
    "punchline": "A schema update"
  },
  {
    "setup": "Why don't data engineers like shortcuts?",
    "punchline": "They prefer the full pipeline"
  },
  {
    "setup": "What's a data engineer's favorite fruit?",
    "punchline": "Dates... for timestamps"
  },
  {
    "setup": "Why did the data engineer become a therapist?",
    "punchline": "They were good at handling emotional data"
  },
  {
    "setup": "What do you call a data engineer who's always late?",
    "punchline": "Someone with latency issues"
  }
];

export function getRandomJoke() {
  const randomIndex = Math.floor(Math.random() * jokes.length);
  return jokes[randomIndex];
}

export const OverviewPage = () => {
  const joke = getRandomJoke();
  return (
    <Box mb="md" ta="center" mt="10rem">
      <Text size="lg" fw="bold">
        {joke.setup}
      </Text>
      <Text size="md" mt="lg" c="text-light" >
        {joke.punchline}
      </Text>
    </Box>
  );
}
