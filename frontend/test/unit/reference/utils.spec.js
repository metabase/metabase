import {
    tryFetchData,
    tryUpdateData,
    tryUpdateFields,
    buildBreadcrumbs,
    databaseToForeignKeys,
    separateTablesBySchema,
    getQuestion
} from 'metabase/reference/utils';

import { TYPE } from "metabase/lib/types";

describe("Reference utils.js", () => {
    const getProps = ({
        section = {
            fetch: {test1: [], test2: [2], test3: [3,4]}
        },
        entity = { foo: 'foo', bar: 'bar' },
        entities = { foo: {foo: 'foo', bar: 'bar'}, bar: {foo: 'bar', bar: 'foo'} },
        test1 = jasmine.createSpy('test1'),
        test2 = jasmine.createSpy('test2'),
        test3 = jasmine.createSpy('test3'),
        updateField = jasmine.createSpy('updateField'),
        clearError = jasmine.createSpy('clearError'),
        resetForm = jasmine.createSpy('resetForm'),
        endEditing = jasmine.createSpy('endEditing'),
        startLoading = jasmine.createSpy('startLoading'),
        setError = jasmine.createSpy('setError'),
        endLoading = jasmine.createSpy('endLoading')
    } = {}) => ({
        section,
        entity,
        entities,
        test1,
        test2,
        test3,
        updateField,
        clearError,
        resetForm,
        endEditing,
        startLoading,
        setError,
        endLoading
    });

    describe("tryFetchData()", () => {
        it("should call all fetch functions in section with correct arguments", async (done) => {
            const props = getProps();
            await tryFetchData(props);

            expect(props.test1).toHaveBeenCalledWith();
            expect(props.test2).toHaveBeenCalledWith(2);
            expect(props.test3).toHaveBeenCalledWith(3, 4);
            expect(props.clearError.calls.count()).toEqual(1);
            expect(props.startLoading.calls.count()).toEqual(1);
            expect(props.setError.calls.count()).toEqual(0);
            expect(props.endLoading.calls.count()).toEqual(1);
            done();
        });

        xit("should set error when error occurs", async () => {
            const props = getProps(() => Promise.reject('test'));
            tryFetchData(props).catch(error => console.error(error))

            expect(props.test1).toHaveBeenCalledWith();
            expect(props.test2).toHaveBeenCalledWith(2);
            expect(props.test3).toHaveBeenCalledWith(3, 4);
            expect(props.clearError.calls.count()).toEqual(1);
            expect(props.startLoading.calls.count()).toEqual(1);
            expect(props.setError.calls.count()).toEqual(0);
            expect(props.endLoading.calls.count()).toEqual(1);
        });
    });

    describe("tryUpdateData()", () => {
        it("should call update function with merged entity", async (done) => {
            const props = getProps({
                section: {
                    update: 'test1'
                },
                entity: { foo: 'foo', bar: 'bar' }
            });
            const fields = {bar: 'bar2'};

            await tryUpdateData(fields, props);

            expect(props.test1.calls.argsFor(0)[0]).toEqual({foo: 'foo', bar: 'bar2'});
            expect(props.endEditing.calls.count()).toEqual(1);
            expect(props.resetForm.calls.count()).toEqual(1);
            expect(props.startLoading.calls.count()).toEqual(1);
            expect(props.setError.calls.count()).toEqual(0);
            expect(props.endLoading.calls.count()).toEqual(1);
            done();
        });

        it("should ignore untouched fields when merging changed fields", async (done) => {
            const props = getProps({
                section: {
                    update: 'test1'
                },
                entity: { foo: 'foo', bar: 'bar' }
            });
            const fields = {foo: '', bar: undefined, boo: 'boo'};

            await tryUpdateData(fields, props);

            expect(props.test1.calls.argsFor(0)[0]).toEqual({foo: '', bar: 'bar', boo: 'boo'});
            expect(props.endEditing.calls.count()).toEqual(1);
            expect(props.resetForm.calls.count()).toEqual(1);
            expect(props.startLoading.calls.count()).toEqual(1);
            expect(props.setError.calls.count()).toEqual(0);
            expect(props.endLoading.calls.count()).toEqual(1);
            done();
        });
    });

    describe("tryUpdateFields()", () => {
        it("should call update function with all updated fields", async (done) => {
            const props = getProps();
            const formFields = {
                foo: {foo: undefined, bar: 'bar2'},
                bar: {foo: '', bar: 'bar2'}
            };

            await tryUpdateFields(formFields, props);

            expect(props.updateField.calls.argsFor(0)[0]).toEqual({foo: 'foo', bar: 'bar2'});
            expect(props.updateField.calls.argsFor(1)[0]).toEqual({foo: '', bar: 'bar2'});
            done();
        });

        it("should not call update function for items where all fields are untouched", async (done) => {
            const props = getProps();
            const formFields = {
                foo: {foo: undefined, bar: undefined},
                bar: {foo: undefined, bar: ''}
            };

            await tryUpdateFields(formFields, props);

            expect(props.updateField.calls.argsFor(0)[0]).toEqual({foo: 'bar', bar: ''});
            expect(props.updateField.calls.count()).toEqual(1);
            done();
        });
    });

    describe("databaseToForeignKeys()", () => {
        it("should build foreignKey viewmodels from database", () => {
            const database = {
                tables_lookup: {
                    1: {
                        id: 1,
                        display_name: 'foo',
                        schema: 'PUBLIC',
                        fields: [
                            {
                                id: 1,
                                special_type: TYPE.PK,
                                display_name: 'bar',
                                description: 'foobar'
                            }
                        ]
                    },
                    2: {
                        id: 2,
                        display_name: 'bar',
                        schema: 'public',
                        fields: [
                            {
                                id: 2,
                                special_type: TYPE.PK,
                                display_name: 'foo',
                                description: 'barfoo'
                            }
                        ]
                    },
                    3: {
                        id: 3,
                        display_name: 'boo',
                        schema: 'TEST',
                        fields: [
                            {
                                id: 3,
                                display_name: 'boo',
                                description: 'booboo'
                            }
                        ]
                    }
                }
            };

            const foreignKeys = databaseToForeignKeys(database);

            expect(foreignKeys).toEqual({
                1: { id: 1, name: 'Public.foo → bar', description: 'foobar' },
                2: { id: 2, name: 'bar → foo', description: 'barfoo' }
            });
        });
    });

    describe("buildBreadcrumbs()", () => {
        const section1 = {
            id: 1,
            breadcrumb: 'section1'
        };

        const section2 = {
            id: 2,
            breadcrumb: 'section2',
            parent: section1
        };

        const section3 = {
            id: 3,
            breadcrumb: 'section3',
            parent: section2
        };

        const section4 = {
            id: 4,
            breadcrumb: 'section4',
            parent: section3
        };

        const section5 = {
            id: 5,
            breadcrumb: 'section5',
            parent: section4
        };

        it("should build correct breadcrumbs from parent section", () => {
            const breadcrumbs = buildBreadcrumbs(section1);
            expect(breadcrumbs).toEqual([
                [ 'section1' ]
            ]);
        });

        it("should build correct breadcrumbs from child section", () => {
            const breadcrumbs = buildBreadcrumbs(section3);
            expect(breadcrumbs).toEqual([
                [ 'section1', 1 ],
                [ 'section2', 2 ],
                [ 'section3' ]
            ]);
        });

        it("should keep at most 3 highest level breadcrumbs", () => {
            const breadcrumbs = buildBreadcrumbs(section5);
            expect(breadcrumbs).toEqual([
                [ 'section3', 3 ],
                [ 'section4', 4 ],
                [ 'section5' ]
            ]);
        });
    });

    describe("tablesToSchemaSeparatedTables()", () => {
        it("should add schema separator to appropriate locations", () => {
            const tables = {
                1: { id: 1, name: 'table1', schema: 'foo' },
                2: { id: 2, name: 'table2', schema: 'bar' },
                3: { id: 3, name: 'table3', schema: 'boo' },
                4: { id: 4, name: 'table4', schema: 'bar' },
                5: { id: 5, name: 'table5', schema: 'foo' },
                6: { id: 6, name: 'table6', schema: 'bar' }
            };

            const section = {};

            const createSchemaSeparator = (table) => table.schema;
            const createListItem = (table) => table;

            const schemaSeparatedTables = separateTablesBySchema(
                tables,
                section,
                createSchemaSeparator,
                createListItem
            );

            expect(schemaSeparatedTables).toEqual([
                ["bar", { id: 2, name: 'table2', schema: 'bar' }],
                { id: 4, name: 'table4', schema: 'bar' },
                { id: 6, name: 'table6', schema: 'bar' },
                ["boo", { id: 3, name: 'table3', schema: 'boo' }],
                ["foo", { id: 1, name: 'table1', schema: 'foo' }],
                { id: 5, name: 'table5', schema: 'foo' },
            ]);
        });
    });

    describe("getQuestion()", () => {
        const getNewQuestion = ({
            database = 1,
            table = 2,
            display = "table",
            aggregation,
            breakout,
            filter
        }) => {
            const card = {
                "name": null,
                "display": display,
                "visualization_settings": {},
                "dataset_query": {
                    "database": database,
                    "type": "query",
                    "query": {
                        "source_table": table
                    }
                }
            };
            if (aggregation != undefined) {
                card.dataset_query.query.aggregation = aggregation;
            }
            if (breakout != undefined) {
                card.dataset_query.query.breakout = breakout;
            }
            if (filter != undefined) {
                card.dataset_query.query.filter = filter;
            }
            return card;
        };

        it("should generate correct question for table raw data", () => {
            const question = getQuestion({
                dbId: 3,
                tableId: 4
            });

            expect(question).toEqual(getNewQuestion({
                database: 3,
                table: 4
            }));
        });

        it("should generate correct question for table counts", () => {
            const question = getQuestion({
                dbId: 3,
                tableId: 4,
                getCount: true
            });

            expect(question).toEqual(getNewQuestion({
                database: 3,
                table: 4,
                aggregation: [ "count" ]
            }));
        });

        it("should generate correct question for field raw data", () => {
            const question = getQuestion({
                dbId: 3,
                tableId: 4,
                fieldId: 5
            });

            expect(question).toEqual(getNewQuestion({
                database: 3,
                table: 4,
                breakout: [ 5 ]
            }));
        });

        it("should generate correct question for field group by bar chart", () => {
            const question = getQuestion({
                dbId: 3,
                tableId: 4,
                fieldId: 5,
                getCount: true,
                visualization: 'bar'
            });

            expect(question).toEqual(getNewQuestion({
                database: 3,
                table: 4,
                display: 'bar',
                breakout: [ 5 ],
                aggregation: [ "count" ]
            }));
        });

        it("should generate correct question for field group by pie chart", () => {
            const question = getQuestion({
                dbId: 3,
                tableId: 4,
                fieldId: 5,
                getCount: true,
                visualization: 'pie'
            });

            expect(question).toEqual(getNewQuestion({
                database: 3,
                table: 4,
                display: 'pie',
                breakout: [ 5 ],
                aggregation: [ "count" ]
            }));
        });

        it("should generate correct question for metric raw data", () => {
            const question = getQuestion({
                dbId: 1,
                tableId: 2,
                metricId: 3
            });

            expect(question).toEqual(getNewQuestion({
                aggregation: [ "METRIC", 3 ]
            }));
        });

        it("should generate correct question for metric group by fields", () => {
            const question = getQuestion({
                dbId: 1,
                tableId: 2,
                fieldId: 4,
                metricId: 3
            });

            expect(question).toEqual(getNewQuestion({
                aggregation: [ "METRIC", 3 ],
                breakout: [ 4 ]
            }));
        });

        it("should generate correct question for segment raw data", () => {
            const question = getQuestion({
                dbId: 2,
                tableId: 3,
                segmentId: 4
            });

            expect(question).toEqual(getNewQuestion({
                database: 2,
                table: 3,
                filter: [ "AND", [ "SEGMENT", 4 ] ]
            }));
        });

        it("should generate correct question for segment counts", () => {
            const question = getQuestion({
                dbId: 2,
                tableId: 3,
                segmentId: 4,
                getCount: true
            });

            expect(question).toEqual(getNewQuestion({
                database: 2,
                table: 3,
                aggregation: [ "count" ],
                filter: [ "AND", [ "SEGMENT", 4 ] ]
            }));
        });
    });
});
