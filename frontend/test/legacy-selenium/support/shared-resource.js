
const exitHandlers = []
afterAll(() => {
    return Promise.all(exitHandlers.map(handler => handler()));
})

export default function createSharedResource(resourceName, {
    defaultOptions,
    getKey = (options) => JSON.stringify(options),
    create = (options) => ({}),
    start = (resource) => {},
    stop = (resource) => {},
}) {
    let entriesByKey = new Map();
    let entriesByResource = new Map();

    let exitPromises = [];
    exitHandlers.push(() => {
        for (const entry of entriesByKey.values()) {
            kill(entry);
        }
        return Promise.all(exitPromises);
    })

    function kill(entry) {
        if (entriesByKey.has(entry.key)) {
            entriesByKey.delete(entry.key);
            entriesByResource.delete(entry.resource);
            let p = stop(entry.resource).then(null, (err) =>
                console.log("Error stopping resource", resourceName, entry.key, err)
            );
            exitPromises.push(p);
            return p;
        }
    }

    return {
        get(options = defaultOptions) {
            let key = getKey(options);
            let entry = entriesByKey.get(key);
            if (!entry) {
                entry = {
                    key: key,
                    references: 0,
                    resource: create(options)
                }
                entriesByKey.set(entry.key, entry);
                entriesByResource.set(entry.resource, entry);
            } else {
            }
            ++entry.references;
            return entry.resource;
        },
        async start(resource) {
            let entry = entriesByResource.get(resource);
            return start(entry.resource);
        },
        async stop(resource) {
            let entry = entriesByResource.get(resource);
            if (entry && --entry.references <= 0) {
                await kill(entry);
            }
        }
    }
}
