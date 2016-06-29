/* @flow weak */

import _ from "underscore";
import { createSelector } from 'reselect';


// Database List
export const databases         = state => state.databases;

export const getDatabasesSorted = createSelector(
    [databases],
    (databases) => _.sortBy(databases, 'name')
);

export const hasSampleDataset = createSelector(
    [databases],
    (databases) => _.some(databases, (d) => d.is_sample)
);


// Database Edit
export const getEditingDatabase   = state => state.editingDatabase;
export const getFormState         = state => state.formState;
