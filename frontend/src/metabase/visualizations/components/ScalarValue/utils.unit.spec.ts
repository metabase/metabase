import * as measureText from "metabase/lib/measure-text";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";

import { findSize } from "./utils";

jest.doMock("metabase/lib/measure-text", () => ({
  measureText: jest.fn(),
}));

const createMockMeasureText = (width: number, height: number) => {
  return (_text: string, _style: FontStyle) => ({ width, height });
};

const defaults = {
  text: "test",
  unit: "rem",
  fontFamily: "Lato",
  fontWeight: "900",
};

describe("findSize", () => {
  let measureTextSpy: jest.SpyInstance;

  beforeEach(() => {
    measureTextSpy = jest.spyOn(measureText, "measureText");
  });

  afterEach(() => {
    measureTextSpy.mockRestore();
  });

  it("returns the max size if when text width is smaller than the target width", () => {
    measureTextSpy.mockImplementation(createMockMeasureText(100, 50));

    const size = findSize({
      ...defaults,
      targetWidth: 100,
      targetHeight: 100,
      step: 0.2,
      min: 2,
      max: 5,
    });

    expect(size).toEqual("5rem");
  });

  it("returns the first size with which text width is smaller than the target width", () => {
    measureTextSpy
      .mockImplementationOnce(createMockMeasureText(120, 70))
      .mockImplementationOnce(createMockMeasureText(110, 60))
      .mockImplementationOnce(createMockMeasureText(100, 50)) // this is the one we want
      .mockImplementationOnce(createMockMeasureText(90, 40));

    const size = findSize({
      ...defaults,
      targetWidth: 100,
      targetHeight: 100,
      step: 0.2,
      min: 2,
      max: 5,
    });

    expect(size).toEqual("4.6rem");
  });

  it("returns the min size if text cannot fit into the target width", () => {
    measureTextSpy.mockImplementation(createMockMeasureText(120, 50));

    const size = findSize({
      ...defaults,
      targetWidth: 100,
      targetHeight: 100,
      step: 0.2,
      min: 2,
      max: 5,
    });

    expect(size).toEqual("2rem");
  });

  it("returns the max size if when text height is smaller than the target height", () => {
    measureTextSpy.mockImplementation(createMockMeasureText(50, 100));

    const size = findSize({
      ...defaults,
      targetWidth: 100,
      targetHeight: 100,
      step: 0.2,
      min: 2,
      max: 5,
    });

    expect(size).toEqual("5rem");
  });

  it("returns the first size with which text height is smaller than the target height", () => {
    measureTextSpy
      .mockImplementationOnce(createMockMeasureText(70, 120))
      .mockImplementationOnce(createMockMeasureText(60, 110))
      .mockImplementationOnce(createMockMeasureText(50, 100)) // this is the one we want
      .mockImplementationOnce(createMockMeasureText(40, 90));

    const size = findSize({
      ...defaults,
      targetWidth: 100,
      targetHeight: 100,
      step: 0.2,
      min: 2,
      max: 5,
    });

    expect(size).toEqual("4.6rem");
  });

  it("returns the min size if text cannot fit into the target height", () => {
    measureTextSpy.mockImplementation(createMockMeasureText(50, 120));

    const size = findSize({
      ...defaults,
      targetWidth: 100,
      targetHeight: 100,
      step: 0.2,
      min: 2,
      max: 5,
    });

    expect(size).toEqual("2rem");
  });
});
