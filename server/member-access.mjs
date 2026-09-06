const editableStatuses = new Set(['draft', 'submitted', 'in_review', 'changes_requested', 'approved']);
const duplicateMessages = {
  submissions_full_name_unique_idx: 'A member profile with this name already exists.',
  submissions_enrollment_number_unique_idx: 'A member profile with this enrollment number already exists.',
};

export const memberCanEdit = status => editableStatuses.has(status);
export const duplicateMemberMessage = constraint => duplicateMessages[constraint];
