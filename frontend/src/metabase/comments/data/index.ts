import type { Comment } from "../types";

export const TEST_DATA: Comment[] = [
  {
    model: "dashboard",
    model_id: 1,
    text: "Q3 Performance Dashboard",
    resolved: false,
    reactions: [
      {
        emoji: "👍",
        author: {
          id: 2,
          first_name: "Jane",
          last_name: "Doe",
          email: "jane.doe@example.com",
        },
        id: 101,
      },
      {
        emoji: "🎉",
        author: {
          id: 3,
          first_name: "Bob",
          last_name: "Smith",
          email: "bob.smith@example.com",
        },
        id: 102,
      },
    ],
    author: {
      id: 1,
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@example.com",
    },
    replies: [
      {
        model: "comment",
        model_id: 2,
        text: "Great overview of our Q3 performance!",
        resolved: true,
        reactions: [],
        author: {
          id: 4,
          first_name: "Alice",
          last_name: "Johnson",
          email: "alice.johnson@example.com",
        },
      },
      {
        model: "comment",
        model_id: 3,
        text: "Can we add a breakdown by region?",
        resolved: false,
        reactions: [
          {
            emoji: "🤔",
            author: {
              id: 5,
              first_name: "Charlie",
              last_name: "Brown",
              email: "charlie.brown@example.com",
            },
            id: 103,
          },
        ],
        author: {
          id: 6,
          first_name: "Eva",
          last_name: "Williams",
          email: "eva.williams@example.com",
        },
        replies: [
          {
            model: "comment",
            model_id: 4,
            text: "Good idea, I'll work on that this week.",
            resolved: false,
            reactions: [],
            author: {
              id: 1,
              first_name: "John",
              last_name: "Doe",
              email: "john.doe@example.com",
            },
          },
        ],
      },
    ],
  },
  {
    model: "card",
    model_id: 5,
    text: "Revenue by Product Category",
    resolved: true,
    reactions: [],
    author: {
      id: 7,
      first_name: "David",
      last_name: "Miller",
      email: "david.miller@example.com",
    },
    replies: [
      {
        model: "comment",
        model_id: 6,
        text: "The numbers for Category A seem off. Can we double-check?",
        resolved: true,
        reactions: [
          {
            emoji: "👍",
            author: {
              id: 8,
              first_name: "Fiona",
              last_name: "Garcia",
              email: "fiona.garcia@example.com",
            },
            id: 104,
          },
        ],
        author: {
          id: 9,
          first_name: "George",
          last_name: "Taylor",
          email: "george.taylor@example.com",
        },
        replies: [
          {
            model: "comment",
            model_id: 7,
            text: "You're right, there was an error. I've updated the chart.",
            resolved: true,
            reactions: [
              {
                emoji: "🙏",
                author: {
                  id: 9,
                  first_name: "George",
                  last_name: "Taylor",
                  email: "george.taylor@example.com",
                },
                id: 105,
              },
            ],
            author: {
              id: 7,
              first_name: "David",
              last_name: "Miller",
              email: "david.miller@example.com",
            },
          },
        ],
      },
      {
        model: "comment",
        model_id: 8,
        text: "Great visualization! Very easy to understand.",
        resolved: true,
        reactions: [
          {
            emoji: "❤️",
            author: {
              id: 10,
              first_name: "Hannah",
              last_name: "Lee",
              email: "hannah.lee@example.com",
            },
            id: 106,
          },
        ],
        author: {
          id: 11,
          first_name: "Ian",
          last_name: "Clark",
          email: "ian.clark@example.com",
        },
      },
    ],
  },
  {
    model: "data",
    model_id: 9,
    text: "Customer Satisfaction Survey Results",
    resolved: false,
    reactions: [
      {
        emoji: "📊",
        author: {
          id: 12,
          first_name: "Julia",
          last_name: "White",
          email: "julia.white@example.com",
        },
        id: 107,
      },
    ],
    author: {
      id: 13,
      first_name: "Kevin",
      last_name: "Brown",
      email: "kevin.brown@example.com",
    },
    replies: [
      {
        model: "comment",
        model_id: 10,
        text: "Interesting trends in the data. We should focus on improving our customer service based on these results.",
        resolved: false,
        reactions: [],
        author: {
          id: 14,
          first_name: "Laura",
          last_name: "Martinez",
          email: "laura.martinez@example.com",
        },
      },
      {
        model: "comment",
        model_id: 11,
        text: "Can we break this down by product line?",
        resolved: false,
        reactions: [
          {
            emoji: "👍",
            author: {
              id: 15,
              first_name: "Mike",
              last_name: "Johnson",
              email: "mike.johnson@example.com",
            },
            id: 108,
          },
        ],
        author: {
          id: 16,
          first_name: "Nina",
          last_name: "Patel",
          email: "nina.patel@example.com",
        },
      },
    ],
  },
  {
    model: "comment",
    model_id: 12,
    text: "We should schedule a meeting to discuss the Q4 strategy.",
    resolved: false,
    reactions: [
      {
        emoji: "👍",
        author: {
          id: 17,
          first_name: "Oscar",
          last_name: "Wilson",
          email: "oscar.wilson@example.com",
        },
        id: 109,
      },
      {
        emoji: "📅",
        author: {
          id: 18,
          first_name: "Patricia",
          last_name: "Lopez",
          email: "patricia.lopez@example.com",
        },
        id: 110,
      },
    ],
    author: {
      id: 19,
      first_name: "Quinn",
      last_name: "Chen",
      email: "quinn.chen@example.com",
    },
  },
  {
    model: "comment",
    model_id: 13,
    text: "Has anyone seen the latest competitor analysis report?",
    resolved: true,
    reactions: [],
    author: {
      id: 20,
      first_name: "Rachel",
      last_name: "Kim",
      email: "rachel.kim@example.com",
    },
    replies: [
      {
        model: "comment",
        model_id: 14,
        text: "Yes, I have it. I'll send it to you right away.",
        resolved: true,
        reactions: [
          {
            emoji: "🙏",
            author: {
              id: 20,
              first_name: "Rachel",
              last_name: "Kim",
              email: "rachel.kim@example.com",
            },
            id: 111,
          },
        ],
        author: {
          id: 21,
          first_name: "Sam",
          last_name: "Taylor",
          email: "sam.taylor@example.com",
        },
      },
    ],
  },
  {
    model: "dashboard",
    model_id: 15,
    text: "Marketing Campaign Performance",
    resolved: false,
    reactions: [
      {
        emoji: "🚀",
        author: {
          id: 22,
          first_name: "Tina",
          last_name: "Moore",
          email: "tina.moore@example.com",
        },
        id: 112,
      },
    ],
    author: {
      id: 23,
      first_name: "Ulysses",
      last_name: "Grant",
      email: "ulysses.grant@example.com",
    },
    replies: [
      {
        model: "comment",
        model_id: 16,
        text: "The social media campaign seems to be outperforming our email marketing. Should we reallocate some budget?",
        resolved: false,
        reactions: [],
        author: {
          id: 24,
          first_name: "Victoria",
          last_name: "Adams",
          email: "victoria.adams@example.com",
        },
      },
      {
        model: "comment",
        model_id: 17,
        text: "Great insights! Let's discuss this in our next marketing meeting.",
        resolved: true,
        reactions: [
          {
            emoji: "👍",
            author: {
              id: 25,
              first_name: "William",
              last_name: "Brown",
              email: "william.brown@example.com",
            },
            id: 113,
          },
        ],
        author: {
          id: 26,
          first_name: "Xena",
          last_name: "Wilson",
          email: "xena.wilson@example.com",
        },
      },
    ],
  },
];
