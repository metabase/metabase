---
title: "How Metabase billing works"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
redirect_from:
  - /pricing/how-billing-works
---

# How Metabase billing works

When you sign up for a paid Metabase plan on our website, you can elect to pay in two ways:

- [Monthly billing](#how-monthly-billing-works)
- [Annual billing](#how-annual-billing-works) (10% discount)

Both billing frequencies include a flat monthly or annual payment, and bill additional [user accounts](#what-counts-as-a-user-account) each month on a prorated basis (or quarterly, if you're [paying by invoice](#how-invoicing-works-for-pro-plans)).

Companies with large number of users can talk to sales about our [Enterprise plan](https://www.metabase.com/sales/), which includes more options and discounts.

## How monthly billing works

Though we bill you monthly, we calculate how much you owe each day. So, say you're on the [Starter plan](https://www.metabase.com/pricing/). Your monthly bill would include:

- $100 flat payment for the month. This payment additionally covers the first five people who use your Metabase that month. If you have fewer than five people using your Metabase, your bill will still be $100 that month.
- Each additional person costs \$6, prorated for how many days their [accounts were available](#what-counts-as-a-user-account) that month. So if an account only existed for the last 10 days of your 30 day billing period, you'd only be charged for those 10 days, not for the full 30 days. Same goes if you deactivated an account before the end of the billing period, you'll only be charged for the days when the account was available for use during that billing period. Basically, you only ever pay for all accounts in your Metabase that haven't been deactivated yet.

## How annual billing works

Paying up front for a year will save you 10%. So, again let's use the [Starter plan](https://www.metabase.com/pricing/) as an example. With annual billing, you will:

- Have an annual payment of $918. That payment additionally covers five user accounts. This flat payment is made up front; it's not billed monthly. If you have fewer than five accounts, you still pay $918 for the year.
- For each additional user account above those first five user accounts, you'll be billed at $54, prorated for the year. So, for example, if you start out with just the first five accounts that are included in the initial $918 annual payment, then decide to add another user account six months into your annual billing cycle, you'll only be charged $27 dollars for that account, as you'll only need to pay for the remaining six months. When the annual billing cycle repeats, you'll be charged $918 for the first five users, plus \$54 for that additional user (and any other additional users you've added in the interim).
- If your user account number dips below the amount you've already paid for, you won't be refunded. But you'll also only be charged for additional users when the number goes above the previously paid amount.
- Pro-rated true-ups are billed either monthly or quarterly, depending on [how you're paying](#for-annual-plans-payment-type-affects-how-often-youre-charged-for-pro-rated-true-ups). In this case, since we're on a Starter plan paying by credit card, you'll be billed for pro-rated true-ups each month.

### For annual plans, payment type affects how often you're charged for pro-rated true-ups

When paying by [invoice](#how-invoicing-works-for-pro-plans), you're charged an initial annual payment, then charged _quarterly_ for pro-rated true-ups. When paying with a credit card, you're charged the initial annual payment, then charged _monthly_ for pro-rated true-ups.

| Payment type                         | Initial payment | Pro-rated true-up cadence |
| ------------------------------------ | --------------- | ------------------------- |
| Credit card                          | Annually        | Monthly                   |
| [Invoices](#invoicing-for-pro-plans) | Annually        | Quarterly                 |

## Annual billing payments are not refundable

The upfront annual payment, as well as each additional annual user payment and monthly/quarterly true-up payments, are non-refundable. We offer this discounted rate as way to encourage long-term investment in Metabase, which helps us hire more people, improve the product and customer experience, and support the open source project. If you're not ready to commit, no worries; stick with monthly billing.

### When you should choose annual billing

Generally, annual billing is a great deal; it's cheaper across the board. The only case where you might want to prefer monthly billing is if you anticipate downsizing the number of user accounts over the course of the next year.

## What counts as a user account?

A user account is any account which has been added to your Metabase instance (manually or via SSO) that has not been deactivated. You can view a list of user accounts in your **Admin settings** -> **People** list. Any user account which has been [deactivated](../people-and-groups/managing.md#deactivating-an-account) doesn't count toward your number of user accounts. That is to say: if an account exists, but has not been deactivated, that account will count toward your bill, _even if no one signs in and uses that account_. If an account is deactivated, that account is charged for the number of days the account was available for use during that billing period, including the day it was deactivated (since it was available for use for part of the day up until it was deactivated).

## How billing works with embedding

Full app embedding and modular embedding (unless using guest embeds) requires viewers to sign in to your Metabase, which means they will count as users for billing purposes.

Guest embedding doesn’t require viewers to sign in to your Metabase, which means they won’t count as additional users for billing purposes.

## How we count active user accounts each day

Each day, we tally up the active users like so:

- For each Metabase using a particular license token in the last 36 hours,
- We take the maximum number of user accounts at any one time in that instance during that 36-hour period,
- Then add those counts together across all instances with the same token.

For example, say you're running two Metabase instances, A and B, that both use the same license token. If over the last 36 hours:

- Metabase A had a maximum of 3 user accounts
- Metabase B had a maximum of 5 user accounts

Then the number of user accounts would total 8 for that day.

If you're on Metabase Cloud, counting active users works the same: each day we count the maximum number of user accounts at any one time over the previous 36 hours.

We refresh the user count you see in your [Metabase Store account page](https://store.metabase.com) every day. Since the refresh only happens once a day, there might be a delay between when you adjust the number of user accounts in your Metabase and when your accounts sync with your Store page.

Metabase counts each user account as unique, even if that account uses the same email for multiple Metabases. For example, if person@example.com has an account in both instance A and instance B, the total will double count person@example.com (the tallying works like `COUNT`, not `COUNT DISTINCT`).

## Invoicing for Pro plans

Metabase offers annual invoicing for Pro plans (in addition to our Enterprise plans).

### How invoicing works for Pro plans

- After switching to billing via invoices, Metabase will send you an invoice via email for the amount due for that year, as well as payment instructions. Each year after that, you'll get an annual invoice billing you for the coming year.
- **After receiving an invoice via email, you have 15 days to pay the invoice with ACH, wire transfer, or credit card**.
- If you add user accounts to your plan throughout the year, Metabase will bill these true-ups on a quarterly basis, with invoices for the prorated yearly cost of the additional user accounts (see [annual billing](#how-annual-billing-works)).
- Payment can be done via Automated Clearing House (ACH) or wire transfer.
- You can see a list of all of your invoices and their statuses in the **Billing** tab of your Metabase Store account.
- You can add, edit, or remove up to five Tax IDs, which Metabase will include on your invoices.
- You'll still need to keep a valid credit card on file.
- No, we won't use your billing portal, or fill out security or other forms. If you need white-glove treatment, our sales team will be happy to help get you set up on our [Enterprise plan](https://www.metabase.com/sales/).

### Criteria for invoice eligibility

In order to be eligible for invoice billing, you need to have:

- An account with at least one Metabase Pro subscription.
- No failed charges within the last three months (either for monthly or annual billing).
- Ten or more total user accounts in your Metabase, OR ten or more total user accounts across all of your Metabases (if you're running more than one Metabase).

Once you’re eligible to switch to billing via invoices, you’ll receive an eligibility notification. If you haven’t yet gotten the notification, but you think that you meet the criteria, [contact support](mailto:help@metabase.com).
