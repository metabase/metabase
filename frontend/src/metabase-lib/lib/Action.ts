export default class Action {
  perform() {
    console.warn("");
  }
  toString() {
    return "Action";
  }
}

export class ActionClick {
  toString() {
    return "ActionClick";
  }
}
