export default class Base {
    constructor(object = {}) {
        for (const property in object) {
            this[property] = object[property];
        }
    }
}
