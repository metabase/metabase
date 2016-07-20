import { tryFetchData } from 'metabase/reference/utils';

describe("ReferenceApp Main Container", () => {

    describe("tryFetchData()", () => {
        it("should call all fetch functions in section with correct arguments", async () => {
            const props = {
                section: {
                    fetch: {test1: [], test2: [2], test3: [3,4]}
                },
                test1: jasmine.createSpy('test1'),
                test2: jasmine.createSpy('test2'),
                test3: jasmine.createSpy('test3'),
                clearError: jasmine.createSpy('clearError'),
                startLoading: jasmine.createSpy('startLoading'),
                setError: jasmine.createSpy('setError'),
                endLoading: jasmine.createSpy('endLoading')
            };
            await tryFetchData(props);
        });
    });

});
