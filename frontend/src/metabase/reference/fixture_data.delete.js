import insight from "insightful"

export const SIDEBAR_ITEMS = [
  {
    name: 'Understanding our data',
    href: '/reference',
    icon: {
      name: 'reference'
    }
  },
  {
    name: 'Metrics',
    href: '/reference/metrics',
    icon: {
      name: 'chevrondown'
    }
  },
  {
    name: 'Lists',
    href: '/reference/lists',
    icon: {
      name: 'chevrondown'
    }
  },
  {
    name: 'Databases and tables',
    href: '/reference/data',
    icon: {
      name: 'database'
    }
  },
]

export let INSIGHTS = []

const rando = () => Math.floor(Math.random() * 20 + 10)

for(let i = 0; i < rando(); i ++) {
  INSIGHTS.push({
    name: insight(),
    description: 'Derp lerp merp werp',
    icon: {
      name: 'reference'
    }
  })
}
