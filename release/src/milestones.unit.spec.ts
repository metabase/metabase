import {
  checkMilestoneForRelease,
  getNextMilestone,
  setMilestoneForCommits,
} from "./milestones";
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

  describe('setMilestoneForCommits', () => {
    const buildGithub = () => ({
      paginate: jest.fn().mockResolvedValue(testMilestones),
      rest: {
        issues: {
          listMilestones: jest.fn(),
          update: jest.fn(),
        },
      },
    });

    it('is a no-op when no commit messages reference a PR', async () => {
      const github = buildGithub();

      // e.g. the version-bump commit created when cutting a release branch
      await expect(setMilestoneForCommits({
        github: github as any,
        owner: 'metabase',
        repo: 'metabase',
        branchName: 'release-x.57.x',
        commitMessages: ['Bump version to v0.57'],
      })).resolves.toBeUndefined();

      expect(github.rest.issues.update).not.toHaveBeenCalled();
    });
  });

  describe('checkMilestoneForRelease', () => {
    // string sentinels so paginate can dispatch on which rest endpoint it got
    const listMilestones = 'listMilestones';
    const listForRepo = 'listForRepo';
    const listMatchingRefs = 'listMatchingRefs';

    const buildGithub = ({
      milestones = [{ number: 620, title: '0.62' }] as Milestone[],
      tags = [] as { ref: string }[],
    } = {}) => {
      const rest = {
        issues: { listMilestones, listForRepo },
        git: { listMatchingRefs },
        repos: { compareCommitsWithBasehead: jest.fn() },
      };
      const paginate = jest.fn((fn: unknown) => {
        if (fn === listMilestones) return Promise.resolve(milestones);
        if (fn === listMatchingRefs) return Promise.resolve(tags);
        return Promise.resolve([]); // listForRepo -> no milestone issues
      });
      return { paginate, rest };
    };

    it('is a no-op for a pre-release, bailing before any API calls (a major .0 is always cut as a beta/RC)', async () => {
      const github = buildGithub();

      await expect(checkMilestoneForRelease({
        github: github as any,
        owner: 'metabase',
        repo: 'metabase',
        version: 'v0.62.0-beta',
        commitHash: 'b36890cda1b4bd8009b3c416c071937273fe87dc',
      })).resolves.toBeUndefined();

      // never attempt the compare with an `undefined` base ref
      expect(github.rest.repos.compareCommitsWithBasehead).not.toHaveBeenCalled();
      // and bail before touching the API at all — not even the tag list
      expect(github.paginate).not.toHaveBeenCalled();
    });

    it('safety net: skips when there is no prior stable tag in this major, without comparing against `undefined`', async () => {
      // A stable .0 shouldn't happen by convention, but if one ever reaches
      // here, getLastReleaseTag finds no stable base and we must not feed
      // `undefined` into the compare API.
      const github = buildGithub({
        tags: [
          { ref: 'refs/tags/v0.62.0-beta' },
          { ref: 'refs/tags/v0.62.0-RC1' },
        ],
      });

      await expect(checkMilestoneForRelease({
        github: github as any,
        owner: 'metabase',
        repo: 'metabase',
        version: 'v0.62.0',
        commitHash: 'b36890cda1b4bd8009b3c416c071937273fe87dc',
      })).resolves.toBeUndefined();

      expect(github.rest.repos.compareCommitsWithBasehead).not.toHaveBeenCalled();
      // only the tag list was queried, then we bailed before milestone lookups
      expect(github.paginate).toHaveBeenCalledWith(listMatchingRefs, expect.anything());
      expect(github.paginate).not.toHaveBeenCalledWith(listMilestones, expect.anything());
    });
  });
});
