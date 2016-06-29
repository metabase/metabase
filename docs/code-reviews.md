**The overall goal of a code review is to serve as a safety net for other people on our team and help them write better code, not to judge them or their code. When in doubt, assume that they have good intentions and BE NICE.**

## Goals:

* Catch bugs 
* Catch non-obvious consequences of an approach - will this PR make future code harder to secure or more buggy.
* For situations where things were coded without being discussed, a code review serves as a sanity check to make sure a correct approach is being taken
* Point out implications of the PR for parts of Metabase that a PR doesn’t touch
* Point out places where a good approach or style was used. Code reviews are not a hatefest. Unless a PR is completely horrific there should be an equal number of good and bad points brought up.


## Mindset giving a Code Review:

Your primary goal as a reviewer is to serve as a safety net and keep bad code from being merged. The definition of “bad” is highly subjective, context dependent and will change with product time and maturity. 

When you find clear mistakes, take the time to note why you think they are mistakes. 

If you see places where you don’t agree with an approach, speak up. However, also take the time to understand why the author made a certain choice. You should assume that the author made a good decision based on what they knew in the moment. You probably have a different set of knowledge and see different outcomes. Dig into these. They might see things you don’t and vice versa.

Look for tricks, techniques, or idioms you can steal. Your teammates are smart folks. Chances are they have tricks that you can learn from. Make a point of letting them know.

## Mindset getting a Code Review:

The reviewer is doing you a Solid. They are there to help you do the best work you can. The best of the best have coaches, editors and mentors. Your code reviewers should help you in the same way. In situations where they are more experienced, this can be direct mentoring. In situations where they are more junior, they have a fresh pair of eyes that might get you to question deeply held assumptions. 

When a reviewer disagrees with an approach you took, seek to understand why. They might know things or see consequences you didn’t. While they might not have thought as deeply on the specific subject of the PR as you, they likewise probably are thinking about the impacts of the PR on areas you might not be paying attention to. 

If someone slaps a strong :-1: on your PR, be especially patient. Dig into why they think the PR is flawed. Approach the conversation with an intent of making the PR better, not defending your approach. You get no points for being a better debater, but you do get points for shipping better code and a better product, no matter where the inspiration or ideas came from.  


## Process:
* Every PR of significant complexity needs to be :+1:’d by at least one other engineer on the team (or @salsakran) to merge
* Add people you think should review your PR to the PR’s assignees. The reviewer can remove themselves once they have reviewed it, or decided they aren’t an appropriate reviewer
* Code that impacts other engineer’s work should be reviewed by those engineers
* A :+1: is the default “I’m ok with this"
* A :+0: (I made that up) is “I’m not thrilled with this, but other people saying “+1” means it can be merged
* A :-1: is a hard veto. This should be used sparingly in run of the mill PRs, and only for things that are missing tests, flagrant violations of a style guide, or break assumptions another part of the code base depends on. 
* If you cut a major branch without discussing design, or talking through implications with other engineers whose work might be impacted, you should expect a :-1:, and not be hung up on reworking controversial sections. 
* Any PR that has a :-1: CANNOT be merged until it is resolved. 
* The owner of the PR and the person casting a :-1: should resolve the differences in approach.
* In the event that there is an impasse, @salsakran casts a tie-breaking vote. This should be very very rare. 

Note that these :+1:, :+0:, and :-1:’s should be explicitly stated in a comment, and not a reaction on the main description of the PR on github. A change from :-1: to :+1: should also be stated explicitly on a comment.

## Timing:
* PRs for high priority issues should be code reviewed as soon as they are available. 
* PRs for issues in a milestone can wait a few days.
* In the event that there are no :+1:'s on a PR, it is the responsibility of the PR creator to follow up with others and get their code reviewed. To re-iterate, a PR needs to be :+1:’d to be merged, and if it has not been reviewed, it is on the opener of the PR to round up a reviewer. 
* In the event of a :-1: + no clear resolution, both the creator of the PR and the :-1: voter should plan on spending an hour over the next day or two to discuss the issue, and plan on how to resolve it. 
* In the event of no movement on a PR with a :-1: after a week, @salsakran will chime in.
