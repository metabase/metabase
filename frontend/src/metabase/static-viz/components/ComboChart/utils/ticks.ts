export const getXTicksCount = (width: number) => {
  if (width < 460) {
    return 4;
  } else if (width < 700) {
    return 6;
  } else {
    return 8;
  }
};

export const getYTicksCount = (height: number) => {
  if (height < 460) {
    return 5;
  } else if (height < 700) {
    return 7;
  } else {
    return 9;
  }
};
