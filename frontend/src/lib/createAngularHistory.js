
import { createHistory } from 'history';

// An (incomplete) version of history (https://github.com/mjackson/history)
// that listens for Angular's locationChange events.
export const createAngularHistory = ($scope, $location) => {
    let history = createHistory();
    let angularHistory = {};

    // just copy the original methods with a warning
    Object.keys(history).forEach(key => {
        let warned = false;
        angularHistory[key] = (...args) => {
            if (!warned) {
                warned = true;
                console.warn("createAngularHistory doesn't implement", key);
            }
            return history[key](...args);
        };
    });

    angularHistory.createHref = (...args) => {
        return history.createHref(...args);
    }

    angularHistory.listen = (listener) => {
        const handler = () => {
            listener({
                action: "POP",
                hash: $location.hash(), // window.location.hash
                key: history.createKey(),
                pathname: $location.path(), // window.location.pathname
                query: $location.search(),
                search: window.location.search,
                state: null
            });
        };
        handler();
        return $scope.$on("$locationChangeSuccess", handler);
    }

    return angularHistory;
}
