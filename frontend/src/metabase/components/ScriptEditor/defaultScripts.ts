export const defaultScripts: Script[] = [
  {
    id: 0,
    name: "Append to collection names",
    code: `const yesterday = dayjs().subtract(1, "day");
const sixMonthsAgo = dayjs().subtract(6, "month");
const collections = await Collections.all();

const appendWhat = prompt("What do you want to append to the collection names?");
const updates = collections
    .filter(c => c.created_at.isAfter(sixMonthsAgo))
    .map(c => {
      c.name = c.name += appendWhat;
      return c.save();
    });


await Promise.all(updates);
`,
  },
  {
    id: 1,
    name: "Delete collections created in the last N days",
    code: `const howManyDaysAgo = prompt('Delete collections created since this many days ago');
const nDaysAgo = dayjs().subtract(howManyDaysAgo, "day");
const collections = await Collections.all();

const deletions = collections
    .filter(c => c.created_at.isAfter(nDaysAgo))
    .map(c => c.delete());

await Promise.all(deletions);
`,
  },
  {
    id: 2,
    name: "Test LLM prompt",
    code: `
const openai = new OpenAI({
  apiKey: window.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
        { role: "system", content: "You are a helpful assistant." },
        {
            role: "user",
            content: "Write a haiku about recursion in programming.",
        },
    ],
    store: true,
});

showTextInModal('Haiku', completion.choices[0].message.content);
`,
  },
  {
    id: 3,
    name: "Fix collection typos with LLM",
    code: `
const oneMonthAgo = dayjs().subtract(1, "month");

const collections = await Collections.all();
const recentCollections = collections.filter(c => c.created_at.isAfter(oneMonthAgo));

const openai = new OpenAI({
  apiKey: window.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

for (const c of recentCollections) {
  console.log(\`Requesting typo correction for \${c.name}\`);
  const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
              role: "user",
              content: \`Return the provided string with any typographic errors corrected. Return just the string, nothing else. The string: \${c.name}\`,
          },
      ],
      store: true,
  });

  c.name = completion.choices[0].message.content;
  await c.save();
}`,
  },
  {
    id: 4,
    name: "Fix question typos with LLM",
    code: `
const questions = await Questions.all();
const someQuestions = questions.filter(q => q.collection_id === 94);

const openai = new OpenAI({
  apiKey: window.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

for (const q of someQuestions) {
  console.log(\`Requesting typo correction for \${q.name}\`);
  const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
              role: "user",
              content: \`Return the provided string with any typographic errors corrected. Return just the string, nothing else. The string: \${q.name}\`,
          },
      ],
      store: true,
  });

  q.name = completion.choices[0].message.content;
  console.log('new name: ' + q.name);
  await q.save();
}`,
  },
  {
    id: 5,
    name: "Find/replace",
    code: `
const questions = await Questions.all();
const someQuestions = questions.filter(q => q.collection_id === 94);

const find = prompt('Find:');
const replace = prompt('Replace with:');
for (const q of someQuestions) {
  q.name = q.name.replace(find, replace);
  await q.save();
}`,
  },
  {
    id: 6,
    name: "Compare two questions",
    code: `
const openai = new OpenAI({
  apiKey: window.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});
const allQuestions = await Questions.all();
pickQuestion("Pick the first question", async (q1Data) => {
  pickQuestion("Pick the second question", async (q2Data) => {
    const q1 = allQuestions.find((q) => q.id == q1Data.id);
    const q2 = allQuestions.find((q) => q.id == q2Data.id);

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            {
                role: "user",
                content: \`Describe how these two Metabase questions differ. Data describing the first question: \${JSON.stringify(q1)}. Data describing the second question: \${JSON.stringify(q2)}.\`,
            },
        ],
        store: true,
    });

    showTextInModal("Difference between questions", completion.choices[0].message.content);
  })
})`,
  },
  {
    id: 7,
    name: "Translate questions",
    code: `
const questions = await Questions.all();
const someQuestions = questions.filter(q => q.collection_id === 94);

const openai = new OpenAI({
  apiKey: window.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

const language = prompt('Translate into language:');
for (const q of someQuestions) {
  const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
              role: "user",
              content: \`Return the provided string translated into \${language}. Return just the translation, nothing else. The string: \${q.name}\`,
          },
      ],
      store: true,
  });

  q.name = completion.choices[0].message.content;
  await q.save();
}`,
  },
  {
    id: 8,
    name: "Translate recent collections into Gaelic",
    code: `const oneMonthAgo = dayjs().subtract(1, "month");

const collections = await Collections.all();
const recentCollections = collections.filter(c => c.created_at.isAfter(oneMonthAgo));

const openai = new OpenAI({
  apiKey: window.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

for (const c of recentCollections) {
  const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
              role: "user",
              content: \`Return the provided string translated into Gaelic. Return just the translation, nothing else. The string: \${c.name}\`,
          },
      ],
      store: true,
  });

  c.name = completion.choices[0].message.content;
  await c.save();
}`,
  },
  {
    id: 9,
    name: "Explain a collection to me like I'm five",
    code: `
    const collections = await Collections.all();
const relevantCollections = collections.filter(c => c.name === "EBITDA");

const openai = new OpenAI({
  apiKey: window.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

for (const c of relevantCollections) {
  const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
              role: "user",
              content: \`Describe the following Metabase collection to me, very clearly, in a way that a young person. Explain any acronyms or jargon. Return the description, and nothing else. The name of the collection: \${c.name}. The description of the collection: \${c.description}\`,
          },
      ],
      store: true,
  });

  showTextInModal(completion.choices[0].message.content);
}`,
  },
  {
    id: 10,
    name: "Find the question with the longest name",
    code: `const questions = await Questions.all();
let longestName = "";
for (const q of questions) {
  if (q.name.length > longestName.length) {
    longestName = q.name;
  }
}
showTextInModal("Question with the longest name", longestName);
  `,
  },

  {
    id: 11,
    name: "Auto-describe columns",
    code: `pickQuestion("Pick a question", async (q) => {
  await q.populate();
  for (const m of q.result_metadata) {
    const newDescription = await askChatGPT(\`Picture a table named \${q.name}, containing many columns including one named \${m.name}. Devise a useful description of this field. Just respond with this description, nothing else.\`);
    m.description = newDescription;
    await q.save();
  }
});

const askChatGPT = async (prompt) => {
  const openai = new OpenAI({
    apiKey: window.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
  });

  const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
              role: "user",
              content: prompt,
          },
      ],
      store: true,
  });

  return completion.choices[0].message.content;
}
  `,
  },
];
