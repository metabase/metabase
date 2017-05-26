import Query from "./Query";

export default class NativeQuery extends Query {
    isNative() {
        return true;
    }
}
