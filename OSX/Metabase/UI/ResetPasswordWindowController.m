//
//  ResetPasswordWindowController.m
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import <objc/runtime.h>

#import "ResetPasswordTask.h"
#import "ResetPasswordWindowController.h"

@interface ResetPasswordWindowController () <NSTextFieldDelegate>
@property (weak) IBOutlet NSButton *resetPasswordButton;
@property (weak) IBOutlet NSTextField *emailAddressTextField;

@property (nonatomic, strong) ResetPasswordTask *resetPasswordTask;
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
	self.resetPasswordButton.enabled = NO;
	self.resetPasswordButton.title = @"One moment...";
	self.emailAddressTextField.enabled = NO;
	
	self.resetPasswordTask = [[ResetPasswordTask alloc] init];
	[self.resetPasswordTask resetPasswordForEmailAddress:self.emailAddressTextField.stringValue success:^(NSString *resetToken) {
		self.emailAddressTextField.enabled = YES;
		self.resetPasswordButton.title = @"Success!";
		
		NSLog(@"Got reset token: '%@'", resetToken);
		[self.delegate resetPasswordWindowController:self didFinishWithResetToken:resetToken];
		
	} error:^(NSString *errorMessage) {
		self.emailAddressTextField.enabled = YES;
		self.resetPasswordButton.enabled = YES;
		self.resetPasswordButton.title = @"Reset Password";
		
		[[NSAlert alertWithMessageText:@"Password Reset Failed" defaultButton:@"Done" alternateButton:nil otherButton:nil informativeTextWithFormat:@"%@", errorMessage] runModal];
	}];
}

- (IBAction)emailAddressTextFieldDidReturn:(id)sender {
	if (self.resetPasswordButton.isEnabled) [self resetPasswordButtonPressed:self.resetPasswordButton];
}


#pragma mark - NSTextFieldDelegate

- (void)controlTextDidChange:(NSNotification *)obj {
	self.resetPasswordButton.title = @"Reset Password";
	self.resetPasswordButton.enabled = self.emailAddressTextField.stringValue.length > 5;
}

@end