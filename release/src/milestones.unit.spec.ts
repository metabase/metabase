import { getNextMilestone } from "./milestones";
import type { Milestone } from "./types";

describe('milestones', () => {
  const testMilestones = [
    { number: 577, title: '0.57.7' },
    { number: 578, title: '0.57.8' },
    { number: 580, title: '0.58' },
    { number: 581, title: '0.58.1' },
    { number: 599, title: '0.59.9' },
    { number: 5910, title: '0.59.10' },
    { number: 600, title: '0.60' },
    { number: 6010, title: '0.60.10' },
    { number: 6111, title: '0.61.1.1' },
    { number: 612, title: '0.61.2' },
    { number: 613, title: '0.61.3'},
    { number: 621, title: '0.62.1'},
    { number: 6220, title: '0.62.20'},
    { number: 62300, title: '0.62.300'},
    { number: 630, title: '0.63'},
  ] as Milestone[];

  describe('getNextMilestone', () => {
    it('can detect the next milestone for minor versions', () => {
      expect(getNextMilestone({
        openMilestones: testMilestones,
        majorVersion: 57,
      })?.number).toBe(577);

      expect(getNextMilestone({
        openMilestones: testMilestones,
        majorVersion: 59,
      })?.number).toBe(599);

      expect(getNextMilestone({
        openMilestones: testMilestones,
        majorVersion: 62,
      })?.number).toBe(621);
    });

    it('can detect the next milestone for major versions', () => {
      expect(getNextMilestone({
        openMilestones: testMilestones,
        majorVersion: 63,
      })?.number).toBe(630);
    });

    it('can detect the next milestone for mixed major and minor versions', () => {
      expect(getNextMilestone({
        openMilestones: testMilestones,
        majorVersion: 58,
      })?.number).toBe(580);

      expect(getNextMilestone({
        openMilestones: testMilestones,
        majorVersion: 60,
      })?.number).toBe(600);
    });

    it('should return undefined when milestone is missing', () => {
      expect(getNextMilestone({
        openMilestones: testMilestones,
        majorVersion: 56,
      })?.number).toBe(undefined);
    });

    it('should ignore patch versions', () => {
      expect(getNextMilestone({
        openMilestones: testMilestones,
        majorVersion: 61,
      })?.number).toBe(612);
    });
  });
});
