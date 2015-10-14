use strict;
use warnings;

package Metabase::Util;

use Cwd 'getcwd';
use Exporter;
use JSON;
use Term::ANSIColor qw(:constants);

our @ISA = qw(Exporter);
our @EXPORT = qw(config
                 announce
                 print_giant_success_banner
                 get_file_or_die
                 plist_buddy_exec
                 OSX_ARTIFACTS_DIR
                 artifact);

my $config_file = getcwd() . '/bin/config.json';
warn "Missing config file: $config_file\n" .
     "Please copy $config_file.template, and edit it as needed.\n"
     unless (-e $config_file);
my $config = from_json(`cat $config_file`) if -e $config_file;

sub config {
    return $config ? $config->{ $_[0] } : '';
}

sub announce {
    print "\n\n" . GREEN . $_[0] . RESET . "\n\n";
}

sub print_giant_success_banner {
    print "\n\n". BLUE .
        '+----------------------------------------------------------------------+' . "\n" .
        '|                                                                      |' . "\n" .
        '|   _______           _______  _______  _______  _______  _______  _   |' . "\n" .
        '|  (  ____ \|\     /|(  ____ \(  ____ \(  ____ \(  ____ \(  ____ \( )  |' . "\n" .
        '|  | (    \/| )   ( || (    \/| (    \/| (    \/| (    \/| (    \/| |  |' . "\n" .
        '|  | (_____ | |   | || |      | |      | (__    | (_____ | (_____ | |  |' . "\n" .
        '|  (_____  )| |   | || |      | |      |  __)   (_____  )(_____  )| |  |' . "\n" .
        '|        ) || |   | || |      | |      | (            ) |      ) |(_)  |' . "\n" .
        '|  /\____) || (___) || (____/\| (____/\| (____/\/\____) |/\____) | _   |' . "\n" .
        '|  \_______)(_______)(_______/(_______/(_______/\_______)\_______)(_)  |' . "\n" .
        '|                                                                      |' . "\n" .
        '|                                                                      |' . "\n" .
        '+----------------------------------------------------------------------+' . RESET . "\n\n";
}

# Check if a file exists, or die.
# If file path is relative, qualify it by prepending the current dir.
# Return the fully-qualified file path.
sub get_file_or_die {
    my ($filename) = @_;
    $filename = (getcwd() . '/' . $filename) if $filename !~ /^\//;

    die "Error: $filename does not exist.\n" unless -e $filename;

    return $filename;
}

# Run a PlistBuddy command against Metabase-Info.plist
sub plist_buddy_exec {
    my $info_plist = get_file_or_die('OSX/Metabase/Metabase-Info.plist');
    return `/usr/libexec/PlistBuddy -c '@_' "$info_plist"`;
}

use constant OSX_ARTIFACTS_DIR => getcwd() . '/osx-artifacts';
sub artifact {
    # Make the artifacts directory if needed
    system('mkdir', OSX_ARTIFACTS_DIR) if ! -d OSX_ARTIFACTS_DIR;

    return OSX_ARTIFACTS_DIR . "/$_[0]";
}

1;
