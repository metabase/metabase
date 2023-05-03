import React from "react";
import { render } from "@testing-library/react";
import * as dom from "metabase/lib/dom";
import HomePage from "./HomePage";

jest.mock("metabase/lib/dom");

const LayoutMock = () => <div />;
jest.mock("../HomeLayout", () => LayoutMock);

const ContentMock = () => <div />;
jest.mock("../../containers/HomeContent", () => ContentMock);

describe("HomePage", () => {
  let isSmallScreenSpy: jest.SpyInstance;

  beforeEach(() => {
    isSmallScreenSpy = jest.spyOn(dom, "isSmallScreen");
  });

  afterEach(() => {
    isSmallScreenSpy.mockRestore();
  });

  it("should open the navbar on a regular screen", () => {
    const onOpenNavbar = jest.fn();
    isSmallScreenSpy.mockReturnValue(false);

    render(
      <HomePage
        hasMetabot={false}
        onOpenNavbar={onOpenNavbar}
        isAdmin={false}
      />,
    );

    expect(onOpenNavbar).toHaveBeenCalled();
  });

  it("should not open the navbar on a small screen", () => {
    const onOpenNavbar = jest.fn();
    isSmallScreenSpy.mockReturnValue(true);

    render(
      <HomePage
        hasMetabot={false}
        onOpenNavbar={onOpenNavbar}
        isAdmin={false}
      />,
    );

    expect(onOpenNavbar).not.toHaveBeenCalled();
  });
});
