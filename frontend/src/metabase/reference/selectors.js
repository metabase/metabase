import { createSelector } from 'reselect';

const sections = [
    { id: "gettingstarted", name: "Understanding our data", icon: "all" },
    { id: "metrics", name: "Metrics", icon: "star" },
    { id: "lists", name: "Lists", icon: "recents" },
    { id: "databases", name: "Databases and tables", icon: "mine" }
];

export const getSections = (state) => sections;
