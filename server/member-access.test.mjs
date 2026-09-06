import assert from 'node:assert/strict';
import test from 'node:test';
import { duplicateMemberMessage, memberCanEdit } from './member-access.mjs';

test('members can edit active profiles but not archived profiles', () => {
  for (const status of ['draft', 'submitted', 'in_review', 'changes_requested', 'approved']) assert.equal(memberCanEdit(status), true);
  assert.equal(memberCanEdit('archived'), false);
  assert.equal(memberCanEdit('unexpected'), false);
});

test('duplicate member constraints return safe messages', () => {
  assert.equal(duplicateMemberMessage('submissions_full_name_unique_idx'), 'A member profile with this name already exists.');
  assert.equal(duplicateMemberMessage('submissions_enrollment_number_unique_idx'), 'A member profile with this enrollment number already exists.');
  assert.equal(duplicateMemberMessage('another_constraint'), undefined);
});
