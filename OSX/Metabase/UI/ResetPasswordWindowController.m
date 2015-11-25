//
//  ResetPasswordWindowController.m
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "ResetPasswordWindowController.h"

@interface ResetPasswordWindowController () <NSTextFieldDelegate>
@property (weak) IBOutlet NSButton *resetPasswordButton;
@property (weak) IBOutlet NSTextField *emailAddressTextField;

@end


@implementation ResetPasswordWindowController

#pragma mark - Lifecycle

- (NSString *)windowNibName {
	return NSStringFromClass(self.class);
}

- (void)windowDidLoad {
    [super windowDidLoad];
}


#pragma mark - Actions

- (IBAction)resetPasswordButtonPressed:(NSButton *)sender {
	NSLog(@"RESET PASSWORD!");
}


#pragma mark - NSTextFieldDelegate

- (void)controlTextDidChange:(NSNotification *)obj {
	self.resetPasswordButton.enabled = self.emailAddressTextField.stringValue.length > 5;
}

@end