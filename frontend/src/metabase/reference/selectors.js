import { createSelector } from 'reselect';
import i from "icepick";

const sections = {
    guide: { id: "guide", name: "Understanding our data", icon: "all" },
    metrics: { id: "metrics", name: "Metrics", icon: "star" },
    lists: { id: "lists", name: "Lists", icon: "recents" },
    databases: { id: "databases", name: "Databases and tables", icon: "mine" }
};

export const getEntitiesLoading = (state) => i.getIn(state, ['metadata', 'requestState', 'databases']) === "LOADING";

export const getEntitiesError = (state) => i.getIn(state, ['metadata', 'requestState', 'databases', 'error']);

export const getSections = (state) => sections;

export const getSectionId = (state) => state.router.params.section ||
    state.router.routes[2].path;

export const getDatabaseId = (state) => state.router.params.databaseId;

export const getSection = createSelector(
    [getSectionId, getSections],
    (sectionId, sections) => sections[sectionId]
);

const getDatabases = (state) => state.metadata.databases;

export const getEntities = createSelector(
    [getSectionId, getDatabases],
    (sectionId, databases) => {
        // console.log(databases)
        return databases;
    }
);

export const getEntity = createSelector(
    [getSectionId, getDatabases, getDatabaseId],
    (sectionId, databases, databaseId) => {
        // console.log(databases)
        return databases[databaseId];
    }
);

const getEntityRequestStates = (state) => i.getIn(state, ['metadata', 'requestState', 'database']);

export const getEntityLoading = createSelector(
    [getDatabaseId, getEntityRequestStates],
    (databaseId, entityRequestStates) => entityRequestStates[databaseId] === 'LOADING'
)

export const getEntityError = createSelector(
    [getDatabaseId, getEntityRequestStates],
    (databaseId, entityRequestStates) => i.getIn(entityRequestStates, [databaseId, 'error'])
)
