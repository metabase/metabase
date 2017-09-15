#! /usr/bin/env perl

use strict;
use warnings;

my $long_remarks = 0;

# loop over every line in migrations file. If line starts with `remarks:` and is over 60 chars, inc count & log error
open(FILE, '<:encoding(UTF-8)', './resources/migrations/000_migrations.yaml') or die $!;
while (<FILE>) {
    $long_remarks += 1 && print "Remark on line $. is too long (${\(length)}/60): $_"
      if m/remarks/ && s/^\s+remarks:\s'(.*)'$/$1/ && length > 60;
}

# if we've seen any remarks that are too long print message and die
die "\n$long_remarks remarks are over 60 characters long, making them incompatible with MySQL 5.1.\n" if $long_remarks;

print 'All remarks are 60 characters or less. Good work.' . "\n";
