import { createSelector } from 'reselect';

const sections = {
    guide: { id: "guide", name: "Understanding our data", icon: "all" },
    metrics: { id: "metrics", name: "Metrics", icon: "star" },
    lists: { id: "lists", name: "Lists", icon: "recents" },
    databases: { id: "databases", name: "Databases and tables", icon: "mine" }
};

export const getSections = (state) => sections;

export const getSectionId = (state) => state.router.params.section;

export const getSection = createSelector(
    [getSectionId, getSections],
    (sectionId, sections) => sections[sectionId]
);

const getDatabases = (state) => state.metadata.databases;

export const getEntityIds = createSelector(
    [getSectionId, getDatabases],
    (sectionId, databases) => {
        return Object.keys(databases);
    }
);
