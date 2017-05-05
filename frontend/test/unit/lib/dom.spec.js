import { getSelectionPosition, setSelectionPosition } from "metabase/lib/dom"

describe("getSelectionPosition/setSelectionPosition", () => {
    let container;
    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
    })
    afterEach(() => {
        document.body.removeChild(container);
    })

    it("should get/set selection on input correctly", () => {
        let input = document.createElement("input");
        container.appendChild(input);
        input.value = "hello world";
        setSelectionPosition(input, [3, 6]);
        const position = getSelectionPosition(input);
        expect(position).toEqual([3, 6]);
    });
    it("should get/set selection on contenteditable correctly", () => {
        let contenteditable = document.createElement("div");
        container.appendChild(contenteditable);
        contenteditable.textContent = "<div>hello world</div>"
        setSelectionPosition(contenteditable, [3, 6]);
        const position = getSelectionPosition(contenteditable);
        expect(position).toEqual([3, 6]);
    });
    it("should not mutate the actual selection", () => {
        let contenteditable = document.createElement("div");
        container.appendChild(contenteditable);
        contenteditable.textContent = "<div>hello world</div>"
        setSelectionPosition(contenteditable, [3, 6]);
        const position = getSelectionPosition(contenteditable);
        expect(position).toEqual([3, 6]);
        const position2 = getSelectionPosition(contenteditable);
        expect(position2).toEqual([3, 6]);
    })
})
