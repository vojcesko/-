# TODO: Add ability to mark tasks as completed in taskteam.html

## Steps to Complete:
- [x] Modify renderTodos function in taskteam.js to include a checkbox for marking tasks as completed
- [x] Add toggleCompleteById function in taskteam.js to handle completion toggle with subtask checks
- [x] Implement permission checks for marking tasks as completed (owner or appropriate participant roles)
- [x] Test the functionality to ensure it works correctly

## Notes:
- Ensure that tasks can only be marked as completed if all subtasks are completed
- Only allow users with proper permissions (task owner or participants with Manager/Responsible roles) to mark tasks as completed
- Update the UI to reflect completed status visually
