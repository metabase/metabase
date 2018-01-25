import insight from 'insightful'
import faker from 'faker'

export const TABLES = Array.from(Array(1000)).map((x, i) => ({
    name: faker.random.word(),
    id: i,
    spaces: [assignSpace()]
}))

export const SPACES = [
    {
        id: 0,
        name: 'Personal',
        slug: 'mine',
        description: 'Your own personal scratch pad.',
        pinnedDashId: null,
        pins: {
            tables: [],
            metrics: [],
            segments: []
        },
        personal: true
    },
    {
        id: 1,
        name: 'Overall',
        slug: 'overall',
        description: 'Important Metabase stuff at a glance',
        pinnedDashId: null,
        pins: {
            tables: [],
            metrics: [],
            segments: []
        }
    },
    {
        id: 2,
        name: 'Growth',
        description: 'Is it working?',
        slug: 'growth',
        pinnedDashId: null,
        pins: {
            tables: [],
            metrics: [],
            segments: []
        }
    },
    {
        id: 3,
        name: 'Product usage',
        slug: 'product-usage',
        description: 'What people are actually doing with this thing.',
        pinnedDashId: null,
        pins: {
            tables: [],
            metrics: [],
            segments: []
        }
    },
    {
        id: 4,
        name: 'Engineering',
        slug: 'eng',
        description: 'What people are actually doing with this thing.',
        pinnedDashId: null,
        pins: {
            tables: [],
            metrics: [],
            segments: []
        }
    },
    {
        id: 5,
        name: 'Misc',
        slug: 'misc',
        description: 'Baseball lives in here.',
        pinnedDashId: null,
        pins: {
            tables: [],
            metrics: [],
            segments: []
        }
    }
]


export const DASHBOARDS = [
    {
        id: 1,
        name: 'KPIs',
        spaces: [1]
    },
    {
        id: 2,
        name: 'Television',
        spaces: [1]
    },
    {
        id: 3,
        name: 'Last 24 hrs',
        spaces: [1]
    },
    {
        id: 4,
        name: 'Downloads',
        spaces: [2]
    },
    {
        id: 5,
        name: 'Github - metabase/metabase',
        spaces: [2]
    },
    {
        id: 6,
        name: 'Google Analytics',
        spaces: [2]
    },
    {
        id: 7,
        name: 'Marketing Numbers',
        spaces: [2]
    },
    {
        id: 8,
        name: 'Vanity Metrics',
        spaces: [2]
    },
    {
        id: 9,
        name: 'Database Tracking',
        spaces: [3]
    },
    {
        id: 10,
        name: 'Inventory - every question type, small cards',
        spaces: [3]
    },
    {
        id: 11,
        name: 'Mobile',
        spaces: [3]
    },
    {
        id: 12,
        name: 'Release 0.24 usage',
        spaces: [3]
    },
    {
        id: 13,
        name: 'Release 0.25 usage',
        spaces: [3]
    },
    {
        id: 14,
        name: 'Release 0.26 usage',
        spaces: [3]
    },
    {
        id: 15,
        name: 'SQL vs Native Queries',
        spaces: [3]
    },
    {
        id: 16,
        name: 'Usage Info',
        spaces: [3]
    },
    {
        id: 17,
        name: 'User Survey Results',
        spaces: [3]
    },
    {
        id: 18,
        name: '#4473 test',
        spaces: [4]
    },
    {
        id: 19,
        name: '#5221 test',
        spaces: [4]
    },
    {
        id: 20,
        name: 'Breakout multiseries test',
        spaces: [4]
    },
    {
        id: 21,
        name: 'Canaries',
        spaces: [4]
    },
    {
        id: 22,
        name: 'Code stats *',
        spaces: [4]
    },
    {
        id: 23,
        name: 'Default field filter value not working?',
        spaces: [4]
    },
    {
        id: 24,
        name: 'Empty',
        spaces: [4]
    },
    {
        id: 25,
        name: 'Goal Bug Canary Dashboard',
        spaces: [4]
    },
    {
        id: 26,
        name: 'New Dashboard test',
        spaces: [4]
    },
    {
        id: 27,
        name: 'Param Demo Dashboard',
        spaces: [4]
    },
    {
        id: 28,
        name: 'Redshift auto refresh filter test',
        spaces: [4]
    },
    {
        id: 29,
        name: '#4473 test',
        spaces: [4]
    },
    {
        id: 30,
        name: 'Slow Dashboard',
        spaces: [4]
    },
    {
        id: 31,
        name: 'Test',
        spaces: [4]
    },
    {
        id: 32,
        name: 'Test MBQL vs SQL field filters',
        spaces: [4]
    },
    {
        id: 33,
        name: 'Baseball',
        spaces: [5]
    },
    {
        id: 34,
        name: 'kdoh github',
        spaces: [4]
    },
    {
        id: 35,
        name: 'Maz Test',
        spaces: [4]
    },
    {
        id: 36,
        name: 'Quantified Cat',
        spaces: [4]
    },
    {
        id: 37,
        name: 'Tom Test',
        spaces: [4]
    },

]

export const PULSES = [
    {
        id: 1,
        name: 'TDaily KPI',
        spaces: [1]
    },
    {
        id: 2,
        name: 'MetaPulse',
        spaces: [1]
    },
    {
        id: 3,
        name: 'Contacts',
        spaces: [2]
    },
    {
        id: 3,
        name: 'SQL -> GUI',
        spaces: [3]
    },
    {
        id: 4,
        name: 'Bug Tracking',
        spaces: [3]
    },
    {
        id: 5,
        name: 'JVM Numbers',
        spaces: [4]
    },
    {
        id: 6,
        name: 'Kyle’s pulse',
        spaces: [5]
    },
]

// Return a random integer comprising one of the space IDs to 
// associate an item with a space
function assignSpace() {
    return Math.floor(Math.random() * (2 - 1 + 1) + 1)
}

