var app = angular.module('bookmarkApp', []);

// 更新为 Worker 代理配置
const WORKER_URL = 'https://base.111600.xyz';
const supabaseClient = supabase.createClient(WORKER_URL, 'dummy-key', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: 'pkce',
    redirectTo: 'https://my.111600.xyz'  // 确保与前端域名一致
  },
  global: {
    headers: {
      'X-Custom-Origin': window.location.hostname
    }
  }
})

// 统一服务定义
app.factory('AuthService', () => ({
  login: (email, password) => supabaseClient.auth.signInWithPassword({ email, password }),
  logout: () => supabaseClient.auth.signOut(),
  getUser: () => supabaseClient.auth.getUser()
}));

app.factory('BookmarkService', () => ({
  getBookmarks: (userId) => supabaseClient.from('bookmarks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
}));

// 唯一控制器定义
app.controller('AuthController', [
  '$scope',
  'AuthService',
  'BookmarkService',
  ($scope, AuthService, BookmarkService) => {
    // 初始化状态
    $scope.sessionChecked = false;
    $scope.isLoggedIn = false;
    $scope.bookmarks = [];
    $scope.username = localStorage.getItem('rememberedEmail') || ''; // 读取存储的邮箱

    // 检查会话状态
    async function checkSession() {
      try {
        const { data: { user }, error } = await AuthService.getUser();
        if (error) {
          throw new Error(error.message || '会话检查失败');
        }
        if (user) {
          $scope.isLoggedIn = true;
          const { data: bookmarks, error: bookmarkError } = await BookmarkService.getBookmarks(user.id);
          if (bookmarkError) throw new Error(bookmarkError.message || '书签加载失败');
          $scope.bookmarks = bookmarks || [];
        }
      } catch (error) {
        // 记录错误以便调试，生产环境可集成 Sentry 等日志服务
        if (error && typeof error === 'object') {
          console.debug('Session check error:', error.message || error);
        }
      } finally {
        $scope.sessionChecked = true;
        $scope.$apply();
      }
    }

    // 页面加载时检查会话
    checkSession();
    
    // 初始化时清除错误消息
    $scope.message = '';

    // 退出登录方法
    $scope.logout = async function() {
      try {
        await AuthService.logout();
        $scope.$apply(() => {
          $scope.isLoggedIn = false;
          $scope.bookmarks = [];
          $scope.message = '';
        });
      } catch (error) {
        // 即使登出失败也清除本地状态
        $scope.$apply(() => {
          $scope.isLoggedIn = false;
          $scope.bookmarks = [];
          console.debug('Logout error (local state cleared):', error?.message);
        });
      }
    };

    // 登录方法
    $scope.login = async function(event) {
      if (event) event.preventDefault();
      if (!$scope.username || !$scope.password) {
        return $scope.message = '请输入邮箱和密码';
      }
      try {
        const { data, error } = await AuthService.login($scope.username, $scope.password);
        if (error) throw new Error(error.message || '登录失败');
    
        const expiresAt = Date.now() + 3600000; // 会话过期时间：1小时
        const { data: bookmarks, error: bookmarkError } = await BookmarkService.getBookmarks(data.user.id);
        if (bookmarkError) throw new Error(bookmarkError.message || '书签加载失败');

        localStorage.setItem('rememberedEmail', $scope.username);
    
        $scope.$apply(() => {
          $scope.bookmarks = bookmarks || [];
          $scope.isLoggedIn = true;
          $scope.sessionExpiresAt = expiresAt;
          $scope.message = '';
        });
      } catch (error) {
        $scope.$apply(() => {
          $scope.message = error.message || '登录失败';
        });
      }
    };
    
    // 定期检查会话状态（每5分钟）
    const sessionCheckInterval = setInterval(() => {
      if ($scope.isLoggedIn) {
        checkSession();
      }
    }, 300000);

    // 注销 interval，防止内存泄漏
    $scope.$on('$destroy', () => {
      if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    });
  }
]);
