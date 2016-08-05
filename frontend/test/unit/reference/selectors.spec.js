import { databaseToForeignKeys, buildBreadcrumbs } from 'metabase/reference/selectors';

describe("Reference selectors.js", () => {
    describe("databaseToForeignKeys()", () => {
        it("should build foreignKey viewmodels from database", () => {
            const database = {
                tables_lookup: {
                    1: {
                        id: 1,
                        display_name: 'foo',
                        schema: 'PUBLIC',
                        fields_lookup: {
                            1: {
                                id: 1,
                                special_type: 'id',
                                display_name: 'bar',
                                description: 'foobar'
                            }
                        }
                    },
                    2: {
                        id: 2,
                        display_name: 'bar',
                        schema: 'public',
                        fields_lookup: {
                            2: {
                                id: 2,
                                special_type: 'id',
                                display_name: 'foo',
                                description: 'barfoo'
                            }
                        }
                    },
                    3: {
                        id: 3,
                        display_name: 'boo',
                        schema: 'TEST',
                        fields_lookup: {
                            3: {
                                id: 3,
                                display_name: 'boo',
                                description: 'booboo'
                            }
                        }
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
});
